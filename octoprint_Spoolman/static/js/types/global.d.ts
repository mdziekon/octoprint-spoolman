declare global {
    // Plugin global definitions
    const pluginSpoolmanApi: PluginSpoolmanApiType;

    /**
     * Octoprint related definitions.
     *
     * Accessible via `window.OctoPrint` instance exposed by OctoPrint itself
     * @see https://github.com/OctoPrint/OctoPrint/blob/1.10.0/src/octoprint/static/js/app/main.js#L2
     */
    const OctoPrint: {
        socket: {
            onMessage: (
                messageType: string,
                callback: (message: {
                    data: {
                        type?: string;
                        payload: unknown;
                    };
                }) => void
            ) => void;
        };
        getCookie: (name: string) => string;
    };
    const OCTOPRINT_VIEWMODELS: {
        push: (viewModel: {
            construct: unknown;
            dependencies: string[];
            elements: (Element | null)[];
        }) => void;
    };

    const PNotify: {
        new (params: {
            title: string;
            text: string;
            type: string;
            hide: boolean;
            addclass: string;
        }): void
    };

    const BASEURL: string;

    // Knockout
    const ko: {
        observable: <ValueType extends unknown>(arg?: ValueType) => ((value: ValueType) => void);
        components: {
            register: (name: string, params: { viewModel: unknown; template: Record<string, string>}) => void;
        };
    };

    // jQuery
    const $: {
        (...args: unknown[]): typeof $;

        on(eventName: string, selector: string, callback: () => void): void;
    };
}

export {}
