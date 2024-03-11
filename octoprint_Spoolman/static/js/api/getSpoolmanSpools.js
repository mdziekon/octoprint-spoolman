/**
 * @typedef {Object} GetSpoolsResponse
 * @property {Object} data
 * @property {Array<Spool>} data.spools
 *
 * @typedef {Object} Spool
 * @property {number} id
 * @property {boolean} archived
 * @property {string} registered
 * @property {number} used_length
 * @property {number} used_weight
 * @property {number} remaining_length
 * @property {number} remaining_weight
 * @property {boolean} archived
 * @property {Object} filament
 * @property {number} filament.id
 * @property {number} filament.diameter
 * @property {number} filament.density
 * @property {number} filament.weight
 * @property {number} filament.spool_weight
 * @property {string} filament.material
 * @property {string} filament.name
 * @property {string} filament.registered
 * @property {string} filament.color_hex
 * @property {Object} filament.vendor
 * @property {number} filament.vendor.id
 * @property {string} filament.vendor.name
 */

/**
 * @param {APIClient} apiClient
 */
async function getSpoolmanSpools(apiClient) {
    const request = await apiClient.callApi("spoolman/spools", {});

    if (!request.isSuccess) {
        return request;
    }
    if (!request.payload.response) {
        return /** @type Success<{ response: undefined }> */ (request);
    }

    return /** @type Success<{ response: GetSpoolsResponse }> */ (request);
}

(async () => {
    const test = await getSpoolmanSpools(dasdsa);

    if (test.isSuccess) {
        test.payload.response
    }
})
