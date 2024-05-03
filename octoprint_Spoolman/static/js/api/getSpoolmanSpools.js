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
 * @property {number | undefined} remaining_length
 * @property {number | undefined} remaining_weight
 * @property {Object} filament
 * @property {number} filament.id
 * @property {string} filament.registered
 * @property {number} filament.diameter
 * @property {number} filament.density
 * @property {number | undefined} filament.weight
 * @property {number | undefined} filament.spool_weight
 * @property {string | undefined} filament.material
 * @property {string | undefined} filament.name
 * @property {string | undefined} filament.color_hex
 * @property {Object | undefined} filament.vendor
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
