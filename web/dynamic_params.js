import { app } from "../../scripts/app.js";

const getValFromDialog = async (title, message, defaultValue) => {
    return await app.extensionManager.dialog.prompt({
        title,
        message,
        defaultValue,
    });
}
const MAX_CHAR_VARNAME = 50;
function makeValidVariable(
    varName,
    textContent,
    regex = /^[a-z_][a-z0-9_]*$/i
) {
    if (
        !varName ||
        varName.trim() === "" ||
        varName.length > MAX_CHAR_VARNAME ||
        !regex.test(varName)
    ) {
        alert(`${textContent}校验未通过!`);

        return false;
    }
    return true;
}

app.registerExtension({
    name: "Comfy.DynamicParams",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DynamicParams") {
            // 初始化默认属性
            nodeType.prototype.properties = {
                dynamic_params: []
            };

            // 保存原始方法
            const origConfigure = nodeType.prototype.configure;
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            // 添加节点创建方法
            nodeType.prototype.onNodeCreated = function () {
                const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // 初始化基本属性
                if (!this.initialized) {
                    this.initialized = true;
                    this.properties = this.properties || {};
                    this.properties.dynamic_params = this.properties.dynamic_params || [];
                    this.dynamic_params = this.properties.dynamic_params;

                    // 清除现有widgets和连接点
                    this.widgets = this.widgets || [];
                    this.inputs = this.inputs || [];
                    this.outputs = this.outputs || [];

                    // 添加"添加参数"按钮
                    this.addWidget("button", "Add Parameter", "add_param", () => {
                        this.showAddParamDialog();
                    });

                    // 设置节点大小
                    this.setSize(this.computeSize());
                }

                return ret;
            };

            // 修改配置加载方法
            nodeType.prototype.configure = function (info) {
                // 避免重复调用configure
                if (this._configuring) return;
                this._configuring = true;

                try {
                    // 确保properties和dynamic_params存在
                    this.properties = this.properties || {};
                    this.properties.dynamic_params = this.properties.dynamic_params || [];
                    this.dynamic_params = this.properties.dynamic_params;

                    // 调用原始configure
                    if (origConfigure) {
                        origConfigure.call(this, info);
                    }

                    // 合并新的属性
                    if (info.properties) {
                        this.properties = {
                            ...this.properties,
                            ...info.properties,
                            dynamic_params: info.properties.dynamic_params || this.properties.dynamic_params
                        };
                        this.dynamic_params = this.properties.dynamic_params;
                    }

                    // 清除现有widgets和连接点
                    this.widgets = [];
                    this.inputs = [];
                    this.outputs = [this.outputs[0]]; // python中RETURN_TYPES有一个默认placeholder占位, 再次加载workflow时直接使用

                    // 添加"Add Parameter"按钮
                    this.addWidget("button", "Add Parameter", "add_param", () => {
                        this.showAddParamDialog();
                    });

                    // 恢复参数
                    if (Array.isArray(this.dynamic_params) && this.dynamic_params.length > 0) {
                        this.dynamic_params.forEach(param => {
                            if (param && param.name && param.type) {
                                this.addDynamicParam(param.name, param.type, param.value, param.description, false);
                            }
                        });
                    }

                    // 恢复连接
                    if (Array.isArray(info.inputs)) {
                        info.inputs.forEach((input, index) => {
                            if (this.inputs[index]) {
                                this.inputs[index].link = input.link;
                            }
                        });
                    }

                    if (Array.isArray(info.outputs)) {
                        info.outputs.forEach((output, index) => {
                            if (this.outputs[index]) {
                                this.outputs[index].links = output.links || [];
                            }
                        });
                    }

                    // 更新widget状态
                    if (Array.isArray(this.inputs)) {
                        this.inputs.forEach(input => {
                            if (input && input.link != null && Array.isArray(this.widgets)) {
                                const widget = this.widgets.find(w => w && w.options && w.options.nameLinkable === input.name);
                                if (widget) {
                                    widget.disabled = true;
                                }
                            }
                        });
                    }

                    this.setSize(this.computeSize());
                } finally {
                    this._configuring = false;
                }
            };

            // 添加参数对话框
            nodeType.prototype.showAddParamDialog = async function () {
                const outputLen = this?.outputs?.length;
                const defaultVarValue = outputLen ? `var${outputLen + 1}` : "var1";
                const name = await getValFromDialog("Variable", "Enter output variable name:", defaultVarValue);

                if (!makeValidVariable(name, "名称")) {
                    return;
                }
                // 检查参数名是否已存在
                if (Array.isArray(this.dynamic_params) &&
                    this.dynamic_params.some(p => p && p.name === name)) {
                    alert("变量名称已经存在");
                    return;
                }

                const type = await getValFromDialog("Type", "Enter output variable type:", "STRING");
                if (!makeValidVariable(type, "类型", /^[*a-z_][a-z0-9_]*$/i)) {
                    return;
                }

                const defaultValue = await getValFromDialog("Default Value", "Enter output variable Default Value:", "");
                if (defaultValue === null) return;

                const description = await getValFromDialog("description", "Enter parameter description (optional):", "");
                if (description === null) return;

                this.addDynamicParam(name, type.toUpperCase(), defaultValue, description, true);
            };

            // 添加参数方法
            nodeType.prototype.addDynamicParam = function (name, type, defaultValue, description, updateStorage = true) {
                const validTypes = ["STRING", "INT", "FLOAT"];
                if (!validTypes.includes(type)) {
                    if (updateStorage) {
                        console.warn("Invalid parameter type. Must be STRING, INT, or FLOAT");
                    }
                    return;
                }

                // 确保dynamic_params是数组
                if (!Array.isArray(this.dynamic_params)) {
                    this.dynamic_params = [];
                }

                // 创建参数配置
                const param = {
                    name,
                    type,
                    value: defaultValue,
                    description: description || ""
                };

                if (updateStorage) {
                    this.dynamic_params.push(param);
                    this.properties.dynamic_params = this.dynamic_params;
                }

                // 创建widget
                let widget;
                const widgetConfig = {
                    tooltip: description,
                    linkable: true,
                    nameLinkable: name
                };

                switch (type) {
                    case "INT":
                        widget = this.addWidget("number", name, parseInt(defaultValue) || 0,
                            (v) => this.updateParamValue(name, v),
                            { ...widgetConfig, precision: 0 });
                        break;
                    case "FLOAT":
                        widget = this.addWidget("number", name, parseFloat(defaultValue) || 0.0,
                            (v) => this.updateParamValue(name, v),
                            { ...widgetConfig, precision: 3 });
                        break;
                    default: // STRING
                        widget = this.addWidget("string", name, defaultValue || "",
                            (v) => this.updateParamValue(name, v),
                            widgetConfig);
                }

                // 添加input和output
                this.addInput(name, type, { widget: widget });
                this.addOutput(name, type);
            };

            // 更新参数值
            nodeType.prototype.updateParamValue = function (name, value) {
                if (!Array.isArray(this.dynamic_params)) return;

                const param = this.dynamic_params.find(p => p && p.name === name);
                if (param) {
                    param.value = value;
                    this.properties.dynamic_params = this.dynamic_params;
                    this.setDirtyCanvas(true, false);
                }
            };

            // 删除参数方法
            nodeType.prototype.removeParam = function (name) {
                // 找到参数索引
                const paramIndex = this.dynamic_params.findIndex(p => p.name === name);
                if (paramIndex === -1) return;

                // 删除参数
                this.dynamic_params.splice(paramIndex, 1);
                this.properties.dynamic_params = this.dynamic_params;

                // 找到并删除相关的widget
                const widgetIndex = this.widgets.findIndex(w => w.name === name);
                if (widgetIndex !== -1) {
                    this.widgets.splice(widgetIndex, 1);
                }

                // 找到并删除相关的input和其连接
                const inputIndex = this.inputs.findIndex(input => input.name === name);
                if (inputIndex !== -1) {
                    // 如果input有连接，先删除连接
                    const input = this.inputs[inputIndex];
                    if (input.link !== null) {
                        const graph = app.graph;
                        if (graph) {
                            graph.removeLink(input.link);
                        }
                    }
                    // 删除input
                    this.inputs.splice(inputIndex, 1);
                }

                // 找到并删除相关的output和其连接
                const outputIndex = this.outputs.findIndex(output => output.name === name);
                if (outputIndex !== -1) {
                    // 如果output有连接，先删除所有连接
                    const output = this.outputs[outputIndex];
                    if (output.links && output.links.length > 0) {
                        const graph = app.graph;
                        if (graph) {
                            [...output.links].forEach(linkId => {
                                graph.removeLink(linkId);
                            });
                        }
                    }
                    // 删除output
                    this.outputs.splice(outputIndex, 1);
                }

                // 更新工作流配置
                if (this.properties.connections) {
                    // 删除input连接配置
                    if (this.properties.connections.inputs) {
                        this.properties.connections.inputs = this.properties.connections.inputs.filter(
                            input => input.name !== name
                        );
                    }

                    // 删除output连接配置
                    if (this.properties.connections.outputs) {
                        this.properties.connections.outputs = this.properties.connections.outputs.filter(
                            output => output.name !== name
                        );
                    }
                }

                // 删除widget值
                if (this.widgets_values) {
                    const valueIndex = this.widgets.findIndex(w => w.name === name);
                    if (valueIndex !== -1) {
                        this.widgets_values.splice(valueIndex, 1);
                    }
                }

                // 更新序列化数据
                this.onSerialize({
                    properties: this.properties
                });

                // 重新配置节点
                this.setDirtyCanvas(true, true);
                this.setSize(this.computeSize());

                // 通知图表已修改
                if (app.graph) {
                    app.graph.setDirtyCanvas(true, true);
                    app.graph.change();
                }
            };

            // 序列化方法
            nodeType.prototype.onSerialize = function (o) {
                if (!o.properties) {
                    o.properties = {};
                }
                // 更新dynamic_params
                o.properties.dynamic_params = this.dynamic_params;

                // 更新连接信息
                o.properties.connections = {
                    inputs: this.inputs.map(input => ({
                        name: input.name,
                        link: input.link,
                        type: input.type
                    })),
                    outputs: this.outputs.map(output => ({
                        name: output.name,
                        links: output.links,
                        type: output.type
                    }))
                };
            };

            // 反序列化方法
            nodeType.prototype.onConfigure = function (o) {
                if (o.properties) {
                    this.properties = o.properties;
                    if (Array.isArray(o.properties.dynamic_params)) {
                        this.dynamic_params = o.properties.dynamic_params;
                    }
                }
            };

            // 保存原始的getExtraMenuOptions方法
            const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;

            // 重写getExtraMenuOptions方法
            nodeType.prototype.getExtraMenuOptions = function (_, options) {
                // 调用原始方法
                if (origGetExtraMenuOptions) {
                    origGetExtraMenuOptions.apply(this, arguments);
                }

                // 如果没有动态参数，直接返回
                if (!this.dynamic_params || !this.dynamic_params.length) {
                    return options;
                }

                // 添加分隔符
                options.push(null);

                // 为每个动态参数添加删除选项
                this.dynamic_params.forEach(param => {
                    if (param && param.name) {
                        options.push({
                            content: `Delete Parameter "${param.name}"`,
                            callback: () => {
                                if (confirm(`Are you sure you want to delete parameter "${param.name}"?`)) {
                                    this.removeParam(param.name);
                                }
                            }
                        });
                    }
                });

                // return options;
            };

            // 添加处理 widget 输入值的方法
            nodeType.prototype.onWidgetChanged = function (name, value, old_value, widget) {
                if (widget && widget.type === "*") {
                    // 如果是从 Primitive Node 传入的值，优先使用该值
                    return value;
                }
                return old_value;
            };

            // 处理连接状态变化
            nodeType.prototype.onConnectionsChange = function (slotType, slot, isConnected, link_info, ioSlot) {
                if (!ioSlot || slotType !== LiteGraph.INPUT || !Array.isArray(this.widgets)) return;

                const widget = this.widgets.find(w => w && w.options && w.options.nameLinkable === ioSlot.name);
                if (widget) {
                    widget.disabled = isConnected;
                }
            };

            // 处理输入值更新
            nodeType.prototype.onExecute = function () {
                for (const widget of this.widgets) {
                    if (!widget.options?.nameLinkable) continue;

                    const input = this.inputs.find(input => input.name === widget.options.nameLinkable);
                    if (input?.link !== null) {
                        const value = this.getInputData(input.slot);
                        if (value !== undefined) {
                            widget.value = value;
                            this.updateParamValue(widget.options.nameLinkable, value);
                        }
                    }
                }
            };

            // 绘制连接点
            nodeType.prototype.onDrawForeground = function (ctx) {
                if (this.flags.collapsed) return;

                // 不再绘制外部连接点
                // 如果需要其他UI元素的绘制，可以在这里添加
            };

            // 由于移除了外部连接点，相应的鼠标交互逻辑也需要移除
            nodeType.prototype.onMouseDown = function (e, localPos) {
                // 不再处理外部连接点的点击
                return false;
            };

            // 处理输入值变化
            nodeType.prototype.onInputChanged = function (slot, value) {
                const input = this.inputs[slot];
                if (!input) return;

                const widget = this.widgets.find(w => w.options.nameLinkable === input.name);
                if (widget) {
                    widget.value = value;
                    this.updateParamValue(input.name, value);
                }
            };

            // 切换参数模式
            nodeType.prototype.toggleParamMode = function (name) {
                const param = this.dynamic_params.find(p => p.name === name);
                if (!param) return;

                param.widget_mode = !param.widget_mode;

                // 重新配置节点以更新UI
                this.onConfigure({ properties: this.properties });
            };
        }
    }
});
