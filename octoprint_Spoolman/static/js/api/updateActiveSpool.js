/**
 * @typedef {Object} Payload
 * @property {number} toolIdx
 * @property {string} spoolId
 */

/**
 * @typedef {Object} UpdateActiveSpoolResponse
 * @property {Object} data
 * @property {string} data.spoolId
 */

/**
 * @param {APIClient} apiClient
 * @param {Payload} payload
 */
async function updateActiveSpool(apiClient, payload) {
    const request = await apiClient.callApi("self/spool", {
        method: "POST",
        body: JSON.stringify({
            toolIdx: payload.toolIdx,
            spoolId: payload.spoolId,
        }),
    });

    if (!request.isSuccess) {
        return request;
    }
    if (!request.payload.response) {
        return /** @type Success<{ response: undefined }> */ (request);
    }

    return /** @type Success<{ response: UpdateActiveSpoolResponse }> */ (request);
}
