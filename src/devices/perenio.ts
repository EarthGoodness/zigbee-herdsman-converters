import {Zcl} from "zigbee-herdsman";

import * as fz from "../converters/fromZigbee";
import * as tz from "../converters/toZigbee";
import * as exposes from "../lib/exposes";
import * as m from "../lib/modernExtend";
import * as reporting from "../lib/reporting";
import type {DefinitionWithExtend, Fz, KeyValue, Tz} from "../lib/types";
import * as utils from "../lib/utils";

const e = exposes.presets;
const ea = exposes.access;

const switchTypeValues = ["maintained_state", "maintained_toggle", "momentary_state", "momentary_press", "momentary_release"];

const defaultOnOffStateValues = ["on", "off", "previous"];

const manufacturerOptions = {manufacturerCode: Zcl.ManufacturerCode.CUSTOM_PERENIO};

const perenioExtend = {
    addCustomClusterPerenio: () =>
        m.deviceAddCustomCluster("perenioSpecific", {
            ID: 64635,
            manufacturerCode: Zcl.ManufacturerCode.CUSTOM_PERENIO,
            attributes: {},
            commands: {},
            commandsResponse: {},
        }),
};

const fzPerenio = {
    diagnostic: {
        cluster: "haDiagnostic",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result: KeyValue = {};
            if (msg.data.lastMessageLqi !== undefined) {
                result.last_message_lqi = msg.data.lastMessageLqi;
            }
            if (msg.data.lastMessageRssi !== undefined) {
                result.last_message_rssi = msg.data.lastMessageRssi;
            }
            return result;
        },
    } satisfies Fz.Converter,
    switch_type: {
        cluster: "genMultistateValue",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result: KeyValue = {};
            const switchTypeLookup: KeyValue = {
                1: "momentary_state",
                16: "maintained_state",
                204: "maintained_toggle",
                205: "momentary_release",
                220: "momentary_press",
            };
            if (msg.data.presentValue !== undefined) {
                const property = utils.postfixWithEndpointName("switch_type", msg, model, meta);
                result[property] = switchTypeLookup[msg.data.presentValue];
            }
            return result;
        },
    } satisfies Fz.Converter,
    smart_plug: {
        cluster: "perenioSpecific",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result: KeyValue = {};
            if (msg.data[2] !== undefined) {
                result.rms_current = msg.data[2];
            }
            if (msg.data[3] !== undefined) {
                result.rms_voltage = msg.data[3];
            }
            if (msg.data[4] !== undefined) {
                result.voltage_min = msg.data[4];
            }
            if (msg.data[5] !== undefined) {
                result.voltage_max = msg.data[5];
            }
            if (msg.data[10] !== undefined) {
                result.active_power = msg.data[10];
            }
            if (msg.data[11] !== undefined) {
                result.power_max = msg.data[11];
            }
            if (msg.data[14] !== undefined) {
                result.consumed_energy = msg.data[14];
            }
            if (msg.data[15] !== undefined) {
                result.consumed_energy_limit = msg.data[15];
            }
            if (msg.data[24] !== undefined) {
                result.rssi = msg.data[24];
            }
            const powerOnStateLookup = {
                0: "off",
                1: "on",
                2: "previous",
            };
            if (msg.data[0] !== undefined) {
                // @ts-expect-error ignore
                result.default_on_off_state = powerOnStateLookup[msg.data[0]];
            }
            if (msg.data[1] !== undefined) {
                if (msg.data[1] === 0) {
                    result.alarm_voltage_min = false;
                    result.alarm_voltage_max = false;
                    result.alarm_power_max = false;
                    result.alarm_consumed_energy = false;
                } else {
                    if (msg.data[1] & 1) {
                        result.alarm_voltage_min = true;
                    }
                    if (msg.data[1] & 2) {
                        result.alarm_voltage_max = true;
                    }
                    if (msg.data[1] & 4) {
                        result.alarm_power_max = true;
                    }
                    if (msg.data[1] & 8) {
                        result.alarm_consumed_energy = true;
                    }
                }
            }
            return result;
        },
    } satisfies Fz.Converter,
};

const tzPerenio = {
    switch_type: {
        key: ["switch_type"],
        convertSet: async (entity, key, value, meta) => {
            utils.assertString(value, key);
            const switchTypeLookup: KeyValue = {
                momentary_state: 0x0001,
                maintained_state: 0x0010,
                maintained_toggle: 0x00cc,
                momentary_release: 0x00cd,
                momentary_press: 0x00dc,
            };
            await entity.write("genMultistateValue", {presentValue: switchTypeLookup[value]}, utils.getOptions(meta.mapped, entity));
            return {state: {switch_type: value}};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read("genMultistateValue", ["presentValue"]);
        },
    } satisfies Tz.Converter,
    default_state: {
        key: ["default_on_off_state"],
        convertSet: async (entity, key, val, meta) => {
            utils.assertString(val, key);
            const powerOnStateLookup: KeyValue = {
                off: 0,
                on: 1,
                previous: 2,
            };
            await entity.write("perenioSpecific", {0: {value: powerOnStateLookup[val], type: 0x20}}, manufacturerOptions);
            return {state: {default_on_off_state: val}};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read("perenioSpecific", [0]);
        },
    } satisfies Tz.Converter,
    alarms_reset: {
        key: ["alarm_voltage_min", "alarm_voltage_max", "alarm_power_max", "alarm_consumed_energy"],
        convertSet: async (entity, key, val, meta) => {
            await entity.write("perenioSpecific", {1: {value: 0, type: 0x20}}, manufacturerOptions);
            return {state: {alarm_voltage_min: false, alarm_voltage_max: false, alarm_power_max: false, alarm_consumed_energy: false}};
        },
        convertGet: async (entity, key, meta) => {
            await entity.read("perenioSpecific", [1]);
        },
    } satisfies Tz.Converter,
    alarms_limits: {
        key: ["voltage_min", "voltage_max", "power_max", "consumed_energy_limit"],
        convertSet: async (entity, key, val, meta) => {
            switch (key) {
                case "voltage_min":
                    await entity.write("perenioSpecific", {4: {value: val, type: 0x21}}, manufacturerOptions);
                    break;
                case "voltage_max":
                    await entity.write("perenioSpecific", {5: {value: val, type: 0x21}}, manufacturerOptions);
                    break;
                case "power_max":
                    await entity.write("perenioSpecific", {11: {value: val, type: 0x21}}, manufacturerOptions);
                    break;
                case "consumed_energy_limit":
                    await entity.write("perenioSpecific", {15: {value: val, type: 0x21}}, manufacturerOptions);
                    break;
            }
            return {state: {[key]: val}};
        },
        convertGet: async (entity, key, meta) => {
            switch (key) {
                case "voltage_min":
                    await entity.read("perenioSpecific", [4]);
                    break;
                case "voltage_max":
                    await entity.read("perenioSpecific", [5]);
                    break;
                case "power_max":
                    await entity.read("perenioSpecific", [11]);
                    break;
                case "consumed_energy_limit":
                    await entity.read("perenioSpecific", [15]);
                    break;
            }
        },
    } satisfies Tz.Converter,
    on_off_mod: {
        key: ["state", "on_time", "off_wait_time"],
        convertSet: async (entity, key, value, meta) => {
            // @ts-expect-error ignore
            const state = meta.message.state != null ? meta.message.state.toLowerCase() : null;
            utils.validateValue(state, ["toggle", "off", "on"]);
            const alarmVoltageMin = meta.state[`alarm_voltage_min${meta.endpoint_name ? `_${meta.endpoint_name}` : ""}`];
            const alarmVoltageMax = meta.state[`alarm_voltage_max${meta.endpoint_name ? `_${meta.endpoint_name}` : ""}`];
            const alarmPowerMax = meta.state[`alarm_power_max${meta.endpoint_name ? `_${meta.endpoint_name}` : ""}`];
            if (alarmVoltageMin || alarmVoltageMax || alarmPowerMax) {
                return {state: {state: "OFF"}};
            }
            if (state === "on" && (meta.message.on_time != null || meta.message.off_wait_time != null)) {
                const onTime = meta.message.on_time != null ? meta.message.on_time : 0;
                const offWaitTime = meta.message.off_wait_time != null ? meta.message.off_wait_time : 0;

                if (typeof onTime !== "number") {
                    throw Error("The on_time value must be a number!");
                }
                if (typeof offWaitTime !== "number") {
                    throw Error("The off_wait_time value must be a number!");
                }

                const payload = {ctrlbits: 0, ontime: Math.round(onTime * 10), offwaittime: Math.round(offWaitTime * 10)};
                await entity.command("genOnOff", "onWithTimedOff", payload, utils.getOptions(meta.mapped, entity));
            } else {
                await entity.command("genOnOff", state, {}, utils.getOptions(meta.mapped, entity));
                if (state === "toggle") {
                    const currentState = meta.state[`state${meta.endpoint_name ? `_${meta.endpoint_name}` : ""}`];
                    return currentState ? {state: {state: currentState === "OFF" ? "ON" : "OFF"}} : {};
                }
                return {state: {state: state.toUpperCase()}};
            }
        },
        convertGet: async (entity, key, meta) => {
            await entity.read("genOnOff", ["onOff"]);
        },
    } satisfies Tz.Converter,
};

export const definitions: DefinitionWithExtend[] = [
    {
        zigbeeModel: ["PECLS01"],
        model: "PECLS01",
        vendor: "Perenio",
        description: "Flood alarm device",
        fromZigbee: [fz.ias_water_leak_alarm_1, fz.ignore_basic_report, fz.battery],
        toZigbee: [],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await reporting.batteryPercentageRemaining(endpoint);
        },
        exposes: [e.water_leak(), e.battery_low(), e.tamper(), e.battery()],
        ota: true,
    },
    {
        zigbeeModel: ["ZHA-DoorLockSensor"],
        model: "PECWS01",
        vendor: "Perenio",
        description: "Door sensor",
        fromZigbee: [fz.ias_contact_alarm_1, fz.battery, fz.ignore_basic_report, fz.ias_contact_alarm_1_report],
        toZigbee: [],
        exposes: [e.contact(), e.battery(), e.battery_voltage()],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await reporting.batteryPercentageRemaining(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
    },
    {
        fingerprint: [{modelID: "ZHA-PirSensor", manufacturerName: "LDS"}],
        model: "PECMS01",
        vendor: "Perenio",
        description: "Motion sensor",
        fromZigbee: [fz.battery, fz.ias_occupancy_alarm_1],
        toZigbee: [],
        exposes: [e.occupancy(), e.battery_low(), e.tamper(), e.battery()],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await reporting.batteryPercentageRemaining(endpoint);
        },
        ota: true,
    },
    {
        zigbeeModel: ["PEHWE20", "PEHWE2X"],
        model: "PEHWE20",
        vendor: "Perenio",
        description: "Two channel single wire mini-relay",
        fromZigbee: [fz.on_off, fz.power_on_behavior, fzPerenio.diagnostic, fzPerenio.switch_type],
        toZigbee: [tz.on_off, tz.power_on_behavior, tzPerenio.switch_type],
        endpoint: (device) => {
            return {l1: 1, l2: 2};
        },
        meta: {multiEndpoint: true},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint1 = device.getEndpoint(1);
            const endpoint2 = device.getEndpoint(2);
            const endpoint10 = device.getEndpoint(10);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genOnOff"]);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.bind(endpoint10, coordinatorEndpoint, ["haDiagnostic"]);
            const payload = [
                {
                    attribute: "onOff",
                    minimumReportInterval: 0,
                    maximumReportInterval: 3600,
                    reportableChange: 0,
                },
            ];
            const payloadDiagnostic = [
                {
                    attribute: "lastMessageLqi",
                    minimumReportInterval: 5,
                    maximumReportInterval: 60,
                    reportableChange: 0,
                },
                {
                    attribute: "lastMessageRssi",
                    minimumReportInterval: 5,
                    maximumReportInterval: 60,
                    reportableChange: 0,
                },
            ];
            await endpoint1.configureReporting("genOnOff", payload);
            await endpoint2.configureReporting("genOnOff", payload);
            await endpoint10.configureReporting("haDiagnostic", payloadDiagnostic);
            await endpoint1.read("genOnOff", ["onOff", "startUpOnOff"]);
            await endpoint2.read("genOnOff", ["onOff", "startUpOnOff"]);
            await endpoint1.read("genMultistateValue", ["presentValue"]);
            await endpoint2.read("genMultistateValue", ["presentValue"]);
            await endpoint10.read("haDiagnostic", ["lastMessageLqi", "lastMessageRssi"]);
        },
        exposes: [
            e.switch().withEndpoint("l1"),
            e.power_on_behavior().withEndpoint("l1"),
            e.enum("switch_type", ea.ALL, switchTypeValues).withEndpoint("l1"),
            e.switch().withEndpoint("l2"),
            e.power_on_behavior().withEndpoint("l2"),
            e.enum("switch_type", ea.ALL, switchTypeValues).withEndpoint("l2"),
            e.numeric("last_message_lqi", ea.STATE).withUnit("lqi").withDescription("LQI seen by the device").withValueMin(0).withValueMax(255),
            e.numeric("last_message_rssi", ea.STATE).withUnit("dB").withDescription("RSSI seen by the device").withValueMin(-128).withValueMax(127),
        ],
    },
    {
        zigbeeModel: ["PEHPL0X"],
        model: "PEHPL0X",
        vendor: "Perenio",
        description: "Power link",
        extend: [perenioExtend.addCustomClusterPerenio()],
        fromZigbee: [fz.on_off, fzPerenio.smart_plug, fz.metering],
        toZigbee: [tzPerenio.on_off_mod, tzPerenio.default_state, tzPerenio.alarms_reset, tzPerenio.alarms_limits],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["genOnOff", "perenioSpecific"]);
            const payload = [
                {
                    attribute: "onOff",
                    minimumReportInterval: 1,
                    maximumReportInterval: 3600,
                    reportableChange: 0,
                },
            ];
            await endpoint.configureReporting("genOnOff", payload);
            await endpoint.configureReporting("perenioSpecific", [
                {
                    attribute: {ID: 0x000a, type: 0x21},
                    minimumReportInterval: 5,
                    maximumReportInterval: 60,
                    reportableChange: 0,
                },
            ]);
            await endpoint.configureReporting("perenioSpecific", [
                {
                    attribute: {ID: 0x000e, type: 0x23},
                    minimumReportInterval: 5,
                    maximumReportInterval: 60,
                    reportableChange: 0,
                },
            ]);
            await endpoint.configureReporting("perenioSpecific", [
                {
                    attribute: {ID: 0x0003, type: 0x21},
                    minimumReportInterval: 5,
                    maximumReportInterval: 5,
                    reportableChange: 0,
                },
            ]);
            await endpoint.read("perenioSpecific", [0, 1, 2, 3]);
            await endpoint.read("perenioSpecific", [4, 5, 11, 15]);
        },
        exposes: [
            e.switch(),
            e.enum("default_on_off_state", ea.ALL, defaultOnOffStateValues),
            e.numeric("rms_voltage", ea.STATE).withUnit("V").withDescription("RMS voltage"),
            e.numeric("active_power", ea.STATE).withUnit("W").withDescription("Active power"),
            e.numeric("consumed_energy", ea.STATE).withUnit("W*h").withDescription("Consumed energy"),
            e
                .binary("alarm_voltage_min", ea.ALL, true, false)
                .withDescription("Indicates if the alarm is triggered on the voltage drop below the limit, allows to reset alarms"),
            e
                .binary("alarm_voltage_max", ea.ALL, true, false)
                .withDescription("Indicates if the alarm is triggered on the voltage rise above the limit, allows to reset alarms"),
            e
                .binary("alarm_power_max", ea.ALL, true, false)
                .withDescription("Indicates if the alarm is triggered on the active power rise above the limit, allows to reset alarms"),
            e
                .binary("alarm_consumed_energy", ea.ALL, true, false)
                .withDescription("Indicates if the alarm is triggered when the consumption energy limit is reached, allows to reset alarms"),
            e.numeric("voltage_min", ea.ALL).withValueMin(0).withValueMax(253).withDescription("Minimum allowable voltage limit for alarms."),
            e.numeric("voltage_max", ea.ALL).withValueMin(0).withValueMax(253).withDescription("Maximum allowable voltage limit for alarms."),
            e.numeric("power_max", ea.ALL).withValueMin(0).withValueMax(65534).withDescription("Maximum allowable power limit for alarms."),
            e
                .numeric("consumed_energy_limit", ea.ALL)
                .withValueMin(0)
                .withValueMax(65534)
                .withDescription("Limit of electric energy consumption in kW*h. 0 value represents no limit"),
            e.numeric("rssi", ea.STATE).withUnit("dB").withDescription("RSSI seen by the device").withValueMin(-128).withValueMax(127),
        ],
        ota: true,
    },
];
