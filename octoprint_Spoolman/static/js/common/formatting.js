
/**
 * @param {number} weight
 * @param {{
*  constants: Record<string, unknown>
* }} params
*/
const toWeight = (weight, params) => {
    return `${weight.toFixed(1)}${params.constants['weight_unit']}`;
};

/**
 * @param {Spool} spool
 * @param {{
*  constants: Record<string, unknown>
* }} params
*/
const toSpoolForDisplay = (spool, params) => {
    return {
        filament: {
            color: {
                cssProperty: (
                    spool.filament.color_hex
                        ? 'background-color'
                        : 'background'
                ),
                cssValue: (
                    spool.filament.color_hex
                        ? `#${spool.filament.color_hex}`
                        : 'linear-gradient(45deg, #000000 -25%, #ffffff)'
                ),
            },
            name: (
                spool.filament.name
                    ? {
                        displayValue: spool.filament.name,
                    } : {
                        displayValue: "Unnamed filament",
                    }
            ),
            material: (
                spool.filament.material
                    ? {
                        displayShort: spool.filament.material,
                        displayValue: spool.filament.material,
                    } : {
                        displayShort: "Unknown",
                        displayValue: "Unknown material",
                    }
            ),
            vendor: {
                name: (
                    spool.filament.vendor?.name
                        ? {
                            displayValue: spool.filament.vendor.name,
                        } : {
                            displayValue: "Unknown filament vendor",
                        }
                ),
            },
        },
        used_weight: {
            displayValue: spool.used_weight.toFixed(1),
        },
        remaining_weight: (
            spool.remaining_weight !== undefined
                ? {
                    isValid: true,
                    displayValue: toWeight(spool.remaining_weight, params),
                } : {
                    isValid: false,
                    displayValue: "Unavailable",
                }
        ),
    };
};

/**
 * @param {number} length
 *  Filament path length, in `mm`
 * @param {number} diameter
 *  Filament diameter, in `mm`
 * @param {number} density
 *  Filament density, in `g/cm^3`
 * @returns number
 */
const calculateWeight = (length, diameter, density) => {
    const radius = diameter / 2;
    const volume = length * Math.PI * (radius * radius) / 1000;

    return volume * density;
};
