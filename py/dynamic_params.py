class TautologyStr(str):
	def __ne__(self, other):
		return False

class ByPassTypeTuple(tuple):
	def __getitem__(self, index):
		if index > 0:
			index = 0
		item = super().__getitem__(index)
		if isinstance(item, str):
			return TautologyStr(item)
		return item

class DynamicParams:
    def __init__(self):
        self.params = {}
        self.dynamic_params = []
        
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {},
            "hidden": {
                "unique_id": "UNIQUE_ID", 
                "extra_pnginfo": "EXTRA_PNGINFO",
                "dynamic_params": "DICT",
            },
        }
    
    RETURN_TYPES = ByPassTypeTuple(('STRING',))
    RETURN_NAMES = ("placeholder",)

    FUNCTION = "execute"
    CATEGORY = "Comfyui-Dynamic-Params"

    def execute(self, unique_id=None, extra_pnginfo=None, **kwargs):
        outputs = {}
        dynamic_params = []

        for node in extra_pnginfo['workflow']['nodes']:
            if node['id'] == int(unique_id):
                outputs_valid = [output for output in node.get('outputs', []) if output.get('name','') != '' and output.get('type','') != '']
                outputs = {output['name']: None for output in outputs_valid}
                self.RETURN_TYPES = ByPassTypeTuple(out["type"] for out in outputs_valid)
                self.RETURN_NAMES = tuple(name for name in outputs.keys())
                dynamic_params = node['properties']['dynamic_params']

        results: list[Any] = ['placeholder']
        for param in dynamic_params:
            if not isinstance(param, dict):
                continue

            name = param.get("name")
            # 优先使用输入连接的值，如果没有连接则使用widget的值
            value = kwargs.get(str(name)) or param.get("value")
            results.append(value)

        return tuple(results)

WEB_DIRECTORY = "web"
NODE_CLASS_MAPPINGS = {"DynamicParams": DynamicParams}
NODE_DISPLAY_NAME_MAPPINGS = {"DynamicParams": "Dynamic Params"}
