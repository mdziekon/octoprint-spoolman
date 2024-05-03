/**
 * @typedef {Object} GetSpoolsResponse
 * @property {Object} data
 * @property {Array<Spool>} data.spools
 *
 * @typedef {Object} FilamentVendor
 * @property {number} id
 * @property {string} name
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
 * @property {FilamentVendor | undefined} filament.vendor
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
        return /** @type Failure<undefined> */ ({
            isSuccess: false,
            error: undefined,
        });
    }

    return /** @type Success<{ response: GetSpoolsResponse }> */ (request);
}

/**
 * @type {(spool: Spool) => spool is Spool & { remaining_weight: number }}
 */
const isSpoolValid = (spool) => {
    return (
        spool.remaining_weight !== undefined
    );
};

/**
 * @param {Spool} spool
 */
const toSafeSpool = (spool) => {
    if (isSpoolValid(spool)) {
        return {
            spoolId: spool.id,
            /** @type true */
            isSpoolValid: true,
            spoolData: spool,
        };
    }

    return {
        spoolId: spool.id,
        /** @type false */
        isSpoolValid: false,
        spoolData: spool,
    };
};
