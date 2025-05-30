import * as m from "../lib/modernExtend";
import type {DefinitionWithExtend} from "../lib/types";

export const definitions: DefinitionWithExtend[] = [
    {
        zigbeeModel: ["1001248", "ZBT-ColorTemperature-Panel"],
        model: "1001248",
        vendor: "SLV",
        description: "VALETO CCT LED driver",
        extend: [m.light({colorTemp: {range: [153, 370]}})],
    },
    {
        zigbeeModel: ["1002994"],
        model: "1002994",
        vendor: "SLV",
        description: "VALETO remote (binds to device)",
        fromZigbee: [],
        toZigbee: [],
        exposes: [],
    },
    {
        zigbeeModel: ["ZBT-RGBWLight-AR0844"],
        model: "1001923",
        vendor: "SLV",
        description: "VALETO LED GU10 RGBW",
        extend: [m.light({colorTemp: {range: [153, 556]}, color: true})],
    },
    {
        zigbeeModel: ["1005318"],
        model: "1005318",
        vendor: "SLV",
        description: "VALETO LED E27 RGBW",
        extend: [m.light({colorTemp: {range: [153, 555]}, color: true})],
    },
];
