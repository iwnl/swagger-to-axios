# Swagger to Axios

一个用于将Swagger API规范自动转换为基于Axios的API请求代码的VSCode扩展工具。

## 简介

Swagger to Axios是一个VSCode扩展，能够帮助前端开发者快速将Swagger API文档转换成可直接使用的Axios请求代码。支持JavaScript和TypeScript双语言输出，可自定义配置，大幅提高前后端协作开发效率。

## 功能特点

- 🚀 **一键生成**：从Swagger JSON/URL一键生成API请求代码
- 🔄 **增量更新**：自动生成两个文件(.generated和.custom)，保护自定义代码免受更新影响
- 📦 **按标签分类**：根据Swagger标签自动组织API文件结构
- 📝 **完整注释**：生成包含参数、返回值类型的完整JSDoc注释
- 🛠️ **高度可配置**：支持多种配置选项，适应不同项目需求
- 🔍 **TypeScript支持**：可选生成TypeScript代码及类型定义
- 💼 **代码风格遵循**：支持自定义代码风格（引号、分号、缩进等）

## 安装方法

### 从VSCode扩展商店安装

1. 打开VSCode
2. 点击扩展图标或按下`Ctrl+Shift+X`
3. 搜索`Swagger to Axios`
4. 点击"安装"按钮

### 手动安装VSIX文件

1. 下载最新的`.vsix`文件
2. 在VSCode中，点击扩展图标或按下`Ctrl+Shift+X`
3. 点击更多操作按钮（...），选择"从VSIX安装..."
4. 选择下载的`.vsix`文件

## 使用方法

### 基本用法

1. 打开命令面板（`Ctrl+Shift+P`或`F1`）
2. 输入并选择`转换Swagger到API文件`
3. 选择Swagger数据来源（文件或URL）
4. 选择输出目录
5. 等待生成完成

### 配置文件

可以创建一个配置文件来自定义生成行为：

1. 打开命令面板
2. 输入并选择`创建Swagger到API配置文件模板`
3. 修改生成的配置文件

### 实际工作流程

1. 后端开发人员提供Swagger API文档（JSON文件或URL）
2. 前端开发人员使用本扩展工具生成API请求代码
3. 系统会自动为每个API标签创建两个文件：
   - `.generated.js/.ts` - 包含自动生成的代码（会在更新时被覆盖）
   - `.custom.js/.ts` - 可添加自定义代码的文件（不会被覆盖）
4. 导入自定义API文件到前端项目中使用
5. 当API更新时，重新运行生成命令，只有`.generated`文件会被更新，不会影响自定义代码

## 配置选项

### VSCode设置

可通过VSCode设置面板配置以下选项：

- **输出目录**：API文件生成的默认输出目录
- **使用TypeScript**：是否生成TypeScript文件而非JavaScript文件
- **生成前清空**：是否在生成前清空输出目录中的生成文件
- **代码风格**：引号风格、分号使用、缩进大小等
- **请求库导入**：自定义请求库导入语句
- **API模块名**：自定义API模块名

### 配置文件详细选项

在项目根目录创建`swagger-to-axios.config.js`文件可进行更详细配置：

```js
module.exports = {
  output: {
    useTypeScript: false,        // 是否使用TypeScript
    fileExtension: '.js',        // 文件扩展名
    outputDir: 'api',            // 输出目录
    cleanOutputDir: false,       // 生成前是否清空目录
    fileNaming: '{{name}}.generated', // 生成文件命名模式
    customFileNaming: '{{name}}.custom', // 自定义文件命名模式
  },
  codeStyle: {
    indentType: 'space',         // 缩进类型：'space' 或 'tab'
    indentSize: 2,               // 缩进大小
    useSemicolons: true,         // 是否使用分号
    useSingleQuotes: true,       // 是否使用单引号
    trailingComma: 'es5',        // 尾逗号风格
  },
  naming: {
    apiFunctionNaming: 'camelCase', // API函数命名风格
    parameterNaming: 'camelCase',   // 参数命名风格
  },
  imports: {
    requestLibrary: "import request from '@/utils/request';", // 请求库导入语句
    importTypes: false,          // 是否导入类型
    additionalImports: [],       // 额外导入语句
    moduleNormal: 'api',         // 模块名
    basePath: '',                // 基础路径
  },
  request: {
    defaultRequestOptions: {},   // 默认请求选项
    responseHandling: {
      transform: false,          // 是否转换响应
      transformFunctionName: 'transformResponse', // 转换函数名
    },
  },
  comments: {
    generateJSDoc: true,         // 是否生成JSDoc注释
    includeParamDescriptions: true, // 是否包含参数描述
    includeResponseType: true,   // 是否包含响应类型
    includeDeprecationWarnings: true, // 是否包含弃用警告
  },
  types: {
    generateInterfaces: true,    // 是否生成接口
    interfacePrefix: 'I',        // 接口前缀
    interfaceSuffix: '',         // 接口后缀
    exportTypes: true,           // 是否导出类型
  },
  advanced: {
    templates: {
      apiFunction: null,         // 自定义API函数模板
      typeDefinition: null,      // 自定义类型定义模板
      customFile: null,          // 自定义文件模板
    },
    typeMapping: {},             // 类型映射
    functionDecorators: [],      // 函数装饰器
    beforeRequest: null,         // 请求前处理
    afterRequest: null,          // 请求后处理
  },
};
```

## 生成文件结构

扩展会为每个Swagger标签生成两个文件：

1. **生成文件** (`tagName.generated.js`): 包含自动生成的API代码，后续更新会覆盖此文件
2. **自定义文件** (`tagName.custom.js`): 用于添加自定义代码，不会被更新覆盖

### 自定义文件用法

自定义文件提供了一种安全的方式来扩展或覆盖生成的API：

```javascript
/**
 * 该文件用于对 area-controller 模块的自动生成 API 接口进行自定义扩展，
 * 请勿直接修改 area-controller.generated.js 文件。
 */

// 重新导出所有自动生成的接口
export * from './area-controller.generated';

// 在这里覆盖或扩展需要定制的接口，例如：
export function listAreaNameOptional() {
  // 添加自定义逻辑，如缓存、日志或错误处理
  console.log('正在获取区域列表...');
  return require('./area-controller.generated').listAreaNameOptionalUsingGET()
    .then(response => {
      // 对响应进行额外处理
      return response;
    });
}
```

## 示例

### 生成的API文件示例

```javascript
// area-controller.generated.js
import request from '@/utils/request';

/**
 * 获取所有的区域
 * @returns {Promise<Result«List«OptionLo»»>} - API调用结果
 */
export function listAreaNameOptional() {
  return request({
    url: '/fmb-core-service/area/areaNames',
    method: 'get',
  });
}

/**
 * 获取某area下的所有设备
 * @param {Object} params
 * @param {string} [params.areaName] - areaName
 * @returns {Promise<Result«List«OptionLo»»>} - API调用结果
 */
export function listEqpNameOptional(params) {
  return request({
    url: '/fmb-core-service/area/eqpNames',
    method: 'get',
    params: params,
  });
}
```

### TypeScript 输出示例

```typescript
// 开启 TypeScript 支持后输出的代码
import request from '@/utils/request';

export interface IListAreaNameOptionalResponse {
  code: number;
  data: Array<{
    label: string;
    value: string;
  }>;
  message: string;
}

/**
 * 获取所有的区域
 * @returns {Promise<IListAreaNameOptionalResponse>} - API调用结果
 */
export function listAreaNameOptional(): Promise<IListAreaNameOptionalResponse> {
  return request({
    url: '/fmb-core-service/area/areaNames',
    method: 'get',
  });
}
```

## 常见问题

### 如何处理自定义响应处理？

可以在配置文件中启用响应转换：

```js
{
  request: {
    responseHandling: {
      transform: true,
      transformFunctionName: 'transformResponse',
    },
  }
}
```

这将在生成的代码中添加响应转换，例如：

```js
export function someApi(params) {
  return request({
    url: '/api/some-endpoint',
    method: 'get',
    params: params,
  }).then(transformResponse);
}
```

### 如何在项目中进行测试？

项目包含测试目录，可以用于测试不同的配置选项：

1. 单个测试用例：`/test/cases`
   ```bash
   cd test/cases
   node swagger-to-axios.js
   ```

2. 多配置测试：`/test/multi-cases`
   ```bash
   cd test/multi-cases
   node multi-cases.js
   ```

## 问题反馈

如有问题或建议，请在GitHub仓库提交Issue。

## 贡献指南

欢迎贡献代码或文档改进！请遵循以下步骤：

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可协议

MIT
