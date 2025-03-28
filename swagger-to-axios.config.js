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