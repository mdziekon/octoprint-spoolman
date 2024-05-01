/**
 * @typedef {Object} ToolData
 * @property {number} spoolId
 * @property {number} filamentLength
 * @property {number} filamentWeight
 *
 * @typedef {Object} GetCurrentJobRequirementsResponse
 * @property {Object} data
 * @property {boolean} data.isFilamentUsageAvailable
 * @property {Record<string, ToolData>} data.tools
 */

/**
 * @param {APIClient} apiClient
 */
async function getCurrentJobRequirements(apiClient) {
    const request = await apiClient.callApi("self/current-job-requirements", {
        method: "GET",
    });

    if (!request.isSuccess) {
        return request;
    }
    if (!request.payload.response) {
        return /** @type Success<{ response: undefined }> */ (request);
    }

    return /** @type Success<{ response: GetCurrentJobRequirementsResponse }> */ (request);
}
