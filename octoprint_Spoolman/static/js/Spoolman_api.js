$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    const cache = new PromiseCache();
    const apiClient = new APIClient(PLUGIN_ID, BASEURL);

    const cacheGetSpoolmanSpoolsResult = cache.registerResource("getSpoolmanSpools", {
        getter: async () => {
            const request = await getSpoolmanSpools(apiClient);

            if (!request.isSuccess) {
                console.error("Request error", request.error);
            }

            return request;
        },
    });
    const sharedUpdateActiveSpool = async ({ toolIdx, spoolId }) => {
        const request = await updateActiveSpool(apiClient, { toolIdx, spoolId });

        if (!request.isSuccess) {
            console.error("Request error", request.error);
        }

        return request;
    };

    if (!cacheGetSpoolmanSpoolsResult.isSuccess) {
        throw new Error('[Spoolman][api] Could not create cached "getSpoolmanSpools"');
    }

    window.pluginSpoolmanApi = {
        cache,

        getSpoolmanSpools: cacheGetSpoolmanSpoolsResult.getter,
        updateActiveSpool: sharedUpdateActiveSpool,
    };
});
