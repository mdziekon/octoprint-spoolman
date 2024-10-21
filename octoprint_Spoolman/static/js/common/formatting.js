
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
            color:
                calculateColorCSS(
                    spool.filament.color_hex,
                    spool.filament.multi_color_direction,
                    spool.filament.multi_color_hexes
                ),
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
        lot: (
            spool.lot_nr
                ? {
                    displayShort: calculateShortLot(spool.lot_nr),
                    displayValue: spool.lot_nr,
                } : {
                    displayShort: "N/A",
                    displayValue: "N/A",
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

/**
 *  Generates a CSS property and value for the filament color
 * @param {string | undefined} color_hex
 *  Hex color code for a single color filament or undefined
 * @param {string | undefined} multi_color_direction
 *  Direction of the gradient for multi-color filaments or undefined
 * @param {string | undefined} multi_color_hexes
 *  Hex color codes for multi-color filaments or undefined
 * @returns {{
*   cssProperty: string,
*   cssValue: string,
*  }}
 *  cssProperty and cssValue for the filament color
 */
const calculateColorCSS = (color_hex, multi_color_direction, multi_color_hexes) => {
    if (color_hex) {
        return {
            cssProperty: 'background-color',
            cssValue: `#${color_hex}`,
        };
    }

    if (!multi_color_direction || !multi_color_hexes) {
        return {
            cssProperty: 'background',
            cssValue: 'linear-gradient(45deg, #000000 -25%, #ffffff)',
        };
    }

    return {
        cssProperty: 'background',
        cssValue: calculateGradient(multi_color_direction, multi_color_hexes),
    };
}

/**
 *  Builds a linear-gradient CSS property from the given colors and direction
 * @param {string} direction
 *  Direction of the gradient
 * @param {string} colors
 *  Comma-separated list of colors
 * @returns string
 */
const calculateGradient = (direction, colors) => {
    let gradient = 'linear-gradient(';

    if (direction === 'coaxial') {
        gradient += '90deg';
    } else {
        gradient += '180deg';
    }

    let colorsArray = colors.split(',');
    for (let i = 0; i < colorsArray.length; i++) {
        gradient += `, #${colorsArray[i]} ${(i / colorsArray.length) * 100}% ${((i+1) / colorsArray.length) * 100}%`;
    }

    gradient += ')';
    return gradient;
}

/**
 * @param {string} lot_nr
 *  Lot number
 * @returns string
 */
const calculateShortLot = (lot_nr) => {
    if (lot_nr.length <= 9) {
        return lot_nr;
    }

    return `${lot_nr.substring(0, 3)}...${lot_nr.substring(lot_nr.length - 3)}`;
}
