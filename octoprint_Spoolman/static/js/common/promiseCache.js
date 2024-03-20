class PromiseCache {
    constructor() {
        /**
         * @type {Record<string, {
         *  getter: (...args: unknown[]) => Promise<unknown>,
         *  cachedGetter: ((...args: unknown[]) => Promise<unknown>) & { invalidate: () => void },
         *  resourceState:
         *      | {
         *          isCached: false,
         *      }
         *      | {
         *          isCached: true,
         *          data: unknown,
         *      },
         * }>}
         */
        this.resourcesByKey = {};
    }

    _createCachedGetter(resourceKey) {
        const getter = async (...args) => {
            const resourceCache = this.resourcesByKey[resourceKey];

            if (!resourceCache.resourceState.isCached) {
                const resourceData = await resourceCache.getter(...args);

                resourceCache.resourceState = {
                    isCached: true,
                    data: resourceData,
                };
            }

            return resourceCache.resourceState.data;
        };

        getter.invalidate = () => {
            this.invalidateResource(resourceKey);
        };

        return getter;
    }

    registerResource(resourceKey, params) {
        if (this.resourcesByKey[resourceKey]) {
            return {
                isSuccess: false,
                error: {
                    resourceAlreadyExists: true,
                },
            };
        }

        this.resourcesByKey[resourceKey] = {
            getter: params.getter,
            cachedGetter: this._createCachedGetter(resourceKey),
            resourceState: {
                isCached: false,
            },
        };

        return {
            isSuccess: true,
            getter: this.resourcesByKey[resourceKey].cachedGetter,
        };
    }

    invalidateResource(resourceKey) {
        const resource = this.resourcesByKey[resourceKey];

        if (!resource) {
            return {
                isSuccess: false,
                error: {
                    invalidResource: true,
                },
            };
        }

        resource.resourceState = {
            isCached: false,
        };

        return {
            isSuccess: true,
            payload: undefined,
        };
    }
};
