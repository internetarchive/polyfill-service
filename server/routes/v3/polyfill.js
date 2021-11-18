"use strict";

const createCompressor = require("../../lib/create-compressor");
const getPolyfillParameters = require("../../lib/get-polyfill-parameters");
const polyfillio = require("polyfill-library");
const pipeline = require("util").promisify(require("stream").pipeline);

const lastModified = new Date().toUTCString();
async function respondWithBundle(response, parameters, bundle, next) {
	const compressor = await createCompressor(parameters.compression);
	const headers = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
		"Cache-Control": "public, s-maxage=31536000, max-age=604800, stale-while-revalidate=604800, stale-if-error=604800",
		"Content-Type": "text/javascript; charset=utf-8",
		"surrogate-key": "polyfill-service",
		"Last-Modified": lastModified,
	};
	if (parameters.compression) {
		headers["Content-Encoding"] = parameters.compression;
	}
	response.status(200);
	response.set(headers);

	try {
		await pipeline(bundle, compressor, response);
	} catch (error) {
		if (error && error.code !== "ERR_STREAM_PREMATURE_CLOSE") {
			next(error);
		}
	}
}

async function respondWithMissingFeatures(response, missingFeatures) {
	response.status(400);
	response.set({
		"Cache-Control": "public, s-maxage=31536000, max-age=604800, stale-while-revalidate=604800, stale-if-error=604800",
		"surrogate-key": "polyfill-service",
	});
	response.send(`Requested features do not all exist in polyfill-service, please remove them from the URL: ${missingFeatures.join(",")} do not exist.`);
}

// provide option for consumers to run their service on another context path
const contextPath = process.env.CONTEXT_PATH || "";

module.exports = (app) => {
	app.get([`${contextPath}/v3/polyfill.js`, `${contextPath}/v3/polyfill.min.js`], async (request, response, next) => {
		const parameters = getPolyfillParameters(request);

		// 400 if requested polyfills are missing
		if (parameters.strict) {
			const features = new Set([...(await polyfillio.listAliases()), ...(await polyfillio.listAllPolyfills())]);
			const requestedFeaturesAllExist = parameters.features.every((feature) => features.has(feature));
			if (!requestedFeaturesAllExist) {
				const requestedFeaturesWhichDoNotExist = parameters.features.filter((feature) => !features.has(feature));
				await respondWithMissingFeatures(response, requestedFeaturesWhichDoNotExist);
				return;
			}
		}

		const bundle = await polyfillio.getPolyfillString(parameters);
		await respondWithBundle(response, parameters, bundle, next);
		return;
	});
};
