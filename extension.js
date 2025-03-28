"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { generateAxiosFiles } = require("./codeGenerator");

// 添加默认配置
const defaultConfig = {
    output: {
        useTypeScript: false,
        fileExtension: '.js',
        outputDir: 'api',
        cleanOutputDir: false,
        fileNaming: '{{name}}.generated',
        customFileNaming: '{{name}}.custom',
    },
    codeStyle: {
        indentType: 'space',
        indentSize: 2,
        useSemicolons: true,
        useSingleQuotes: true,
        trailingComma: 'es5',
    },
    naming: {
        apiFunctionNaming: 'camelCase',
        parameterNaming: 'camelCase',
    },
    imports: {
        requestLibrary: "import request from '@/utils/request';",
        importTypes: false,
        additionalImports: [],
        moduleNormal: 'api',
        basePath: '',
    },
    request: {
        defaultRequestOptions: {},
        responseHandling: {
            transform: false,
            transformFunctionName: 'transformResponse',
        },
    },
    comments: {
        generateJSDoc: true,
        includeParamDescriptions: true,
        includeResponseType: true,
        includeDeprecationWarnings: true,
    },
    types: {
        generateInterfaces: true,
        interfacePrefix: 'I',
        interfaceSuffix: '',
        exportTypes: true,
    },
    advanced: {
        templates: {
            apiFunction: null,
            typeDefinition: null,
            customFile: null,
        },
        typeMapping: {},
        functionDecorators: [],
        beforeRequest: null,
        afterRequest: null,
    },
};

/**
 * 加载配置文件
 * @param {string} workspaceRoot 工作区根目录
 * @returns {object} 合并后的配置
 */
function loadConfiguration(workspaceRoot) {
    const configFilePaths = [
        path.join(workspaceRoot, 'swagger-to-axios.config.js'),
        path.join(workspaceRoot, '.swagger-to-axios.config.js'),
        path.join(workspaceRoot, 'swagger-to-axios.config.json'),
        path.join(workspaceRoot, '.swagger-to-axios.config.json'),
    ];

    let userConfig = {};
    // 尝试读取配置文件
    for (const configPath of configFilePaths) {
        try {
            if (fs.existsSync(configPath)) {
                if (configPath.endsWith('.js')) {
                    // 使用require加载JS配置
                    delete require.cache[require.resolve(configPath)]; // 清除缓存
                    userConfig = require(configPath);
                    console.log(`已加载配置文件: ${configPath}`);
                    break;
                } else if (configPath.endsWith('.json')) {
                    // 读取JSON配置
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    userConfig = JSON.parse(configContent);
                    console.log(`已加载配置文件: ${configPath}`);
                    break;
                }
            }
        } catch (error) {
            console.error(`加载配置文件错误: ${configPath}`, error);
            vscode.window.showWarningMessage(`无法加载配置文件 ${path.basename(configPath)}: ${error.message}`);
        }
    }

    // 深度合并配置
    return deepMerge(defaultConfig, userConfig);
}

/**
 * 深度合并两个对象
 * @param {object} target 目标对象
 * @param {object} source 源对象
 * @returns {object} 合并后的对象
 */
function deepMerge(target, source) {
    if (!source) return target;
    const output = { ...target };

    Object.keys(source).forEach(key => {
        if (source[key] instanceof Object && key in target) {
            output[key] = deepMerge(target[key], source[key]);
        } else {
            output[key] = source[key];
        }
    });

    return output;
}

/**
 * 插件激活时被调用
 * @param {vscode.ExtensionContext} context 
 */
function activate(context) {
    // 输出激活信息，便于调试
    console.log('Swagger to Axios 插件已激活');

    // 注册命令
    const convertCommand = vscode.commands.registerCommand(
        'swaggerToAxios.convert', 
        handleConvertCommand
    );

    // 注册设置默认输出目录命令
    const setOutputDirCommand = vscode.commands.registerCommand(
        'swaggerToAxios.setDefaultOutputDir', 
        setDefaultOutputDir
    );

    // 注册创建配置文件命令
    const createConfigCommand = vscode.commands.registerCommand(
        'swaggerToAxios.createConfigFile',
        handleCreateConfigFile
    );

    // 将命令添加到订阅列表，确保插件停用时命令被正确处理
    context.subscriptions.push(convertCommand, setOutputDirCommand, createConfigCommand);
}

/**
 * 处理转换命令
 * @returns {Promise<void>}
 */
async function handleConvertCommand() {
    try {
        // 显示进度指示器
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "生成API文件",
            cancellable: false
        }, async (progress) => {
            // 获取工作区根目录
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error("未打开工作区，请先打开一个项目文件夹");
            }

            // 加载配置
            let config = loadConfiguration(workspaceRoot);
            
            // 合并VSCode设置中的配置
            config = mergeVSCodeSettings(config);

            // 1. 选择Swagger数据来源
            progress.report({ message: "选择Swagger数据来源..." });
            const sourceType = await selectSourceType();
            if (!sourceType) return;

            // 2. 获取Swagger数据
            progress.report({ message: "获取Swagger数据..." });
            const swaggerSource = await getSwaggerSource(sourceType);
            if (!swaggerSource) return;

            // 3. 选择输出目录或使用配置中的目录
            progress.report({ message: "确认输出目录..." });
            let outputDir = config.output.outputDir;
            if (!path.isAbsolute(outputDir)) {
                outputDir = path.join(workspaceRoot, outputDir);
            }
            
            // 允许用户覆盖配置中的输出目录
            const shouldSelectDir = await vscode.window.showQuickPick(
                ['使用配置的输出目录', '选择其他目录'], 
                { placeHolder: `确认输出到 ${outputDir} 还是选择其他目录?` }
            );
            
            if (!shouldSelectDir) return;
            
            if (shouldSelectDir === '选择其他目录') {
                const selectedDir = await selectOutputDirectory();
                if (!selectedDir) return;
                outputDir = selectedDir;
            }

            // 4. 生成API文件
            progress.report({ message: "生成API文件中..." });
            await generateAxiosFiles(swaggerSource, outputDir, config);

            // 5. 显示成功消息
            vscode.window.showInformationMessage('API文件生成成功！');
        });
    } catch (error) {
        // 显示错误消息
        const errorMessage = error.stack || error.message || String(error);
        vscode.window.showErrorMessage(`生成失败: ${error.message}`);
        
        // 记录详细错误信息到控制台
        console.error("Swagger to Axios 转换错误:", errorMessage);
    }
}

/**
 * 合并VSCode设置中的配置
 * @param {object} config - 已加载的配置
 * @returns {object} - 合并后的配置
 */
function mergeVSCodeSettings(config) {
    const vsConfig = vscode.workspace.getConfiguration('swaggerToAxios');
    
    // 深拷贝配置
    const newConfig = JSON.parse(JSON.stringify(config));
    
    // 输出配置
    if (vsConfig.has('output.directory')) {
        newConfig.output.outputDir = vsConfig.get('output.directory');
    }
    if (vsConfig.has('output.useTypeScript')) {
        newConfig.output.useTypeScript = vsConfig.get('output.useTypeScript');
    }
    if (vsConfig.has('output.cleanBeforeGenerate')) {
        newConfig.output.cleanOutputDir = vsConfig.get('output.cleanBeforeGenerate');
    }
    
    // 代码风格配置
    if (vsConfig.has('codeStyle.useSingleQuotes')) {
        newConfig.codeStyle.useSingleQuotes = vsConfig.get('codeStyle.useSingleQuotes');
    }
    if (vsConfig.has('codeStyle.useSemicolons')) {
        newConfig.codeStyle.useSemicolons = vsConfig.get('codeStyle.useSemicolons');
    }
    if (vsConfig.has('codeStyle.indentSize')) {
        newConfig.codeStyle.indentSize = vsConfig.get('codeStyle.indentSize');
    }
    
    // 导入配置
    if (vsConfig.has('imports.requestLibrary')) {
        newConfig.imports.requestLibrary = vsConfig.get('imports.requestLibrary');
    }
    if (vsConfig.has('imports.moduleNormal')) {
        newConfig.imports.moduleNormal = vsConfig.get('imports.moduleNormal');
    }
    
    return newConfig;
}

/**
 * 处理创建配置文件模板的命令
 * @returns {Promise<void>}
 */
async function handleCreateConfigFile() {
    try {
        // 获取工作区根目录
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            throw new Error("未打开工作区，请先打开一个项目文件夹");
        }
        
        // 获取配置文件路径配置
        const vsConfig = vscode.workspace.getConfiguration('swaggerToAxios');
        const configFilePath = vsConfig.get('configFile.path') || 'swagger-to-axios.config.js';
        
        // 构建完整的配置文件路径
        const fullConfigPath = path.join(workspaceRoot, configFilePath);
        
        // 检查文件是否已存在
        if (fs.existsSync(fullConfigPath)) {
            const action = await vscode.window.showWarningMessage(
                `配置文件 ${configFilePath} 已存在，是否覆盖?`,
                '覆盖',
                '取消'
            );
            
            if (action !== '覆盖') {
                return;
            }
        }
        
        // 读取模板文件
        const templatePath = path.join(__dirname, 'swagger-to-axios.config.js');
        let templateContent;
        
        if (fs.existsSync(templatePath)) {
            templateContent = fs.readFileSync(templatePath, 'utf8');
        } else {
            // 如果模板文件不存在，创建默认模板内容
            templateContent = `/**
 * Swagger to Axios 插件配置文件
 * 在项目根目录创建此文件以自定义代码生成行为
 */

module.exports = {
  /**
   * 输出文件配置
   */
  output: {
    // 使用TypeScript代替JavaScript
    useTypeScript: false,
    // 文件扩展名，默认为.js，设置useTypeScript为true时自动变为.ts
    fileExtension: '.js', 
    // 输出目录（相对于工作区根目录）
    outputDir: 'api', 
    // 是否在每次生成时清空输出目录
    cleanOutputDir: false, 
    // 生成的文件命名格式，支持参数 {{name}}（API标签名）
    fileNaming: '{{name}}.generated',
    // 自定义文件命名格式，支持参数 {{name}}（API标签名）
    customFileNaming: '{{name}}.custom',
  },

  /**
   * 代码样式配置
   */
  codeStyle: {
    // 缩进类型: 'space' 或 'tab'
    indentType: 'space',
    // 缩进大小（仅适用于space类型）
    indentSize: 2,
    // 使用分号
    useSemicolons: true,
    // 使用单引号代替双引号
    useSingleQuotes: true,
    // 行尾逗号: 'none', 'es5', 或 'all'
    trailingComma: 'es5',
  },

  /**
   * 函数与变量命名配置
   */
  naming: {
    // API函数命名策略: 'camelCase', 'PascalCase', 'snake_case', 'kebab-case'
    // 或者自定义函数: (operationId, method, path) => string
    apiFunctionNaming: 'camelCase',
    // 参数命名策略，同上
    parameterNaming: 'camelCase',
  },

  /**
   * 导入导出配置
   */
  imports: {
    // 请求库导入语句
    requestLibrary: "import request from '@/utils/request';",
    // 是否导入类型定义
    importTypes: false,
    // 额外导入语句
    additionalImports: [
      // 例如: "import { message } from 'antd';"
    ],
    // 模块名
    moduleNormal: 'api',
    // 基础请求路径，如果为空则使用Swagger中的basePath
    basePath: '', 
  },

  /**
   * 请求配置
   */
  request: {
    // 添加默认请求选项
    defaultRequestOptions: {
      // 例如: headers: { 'Content-Type': 'application/json' }
    },
    // 响应处理配置
    responseHandling: {
      // 是否添加响应数据转换函数
      transform: false,
      // 转换函数名称
      transformFunctionName: 'transformResponse',
    },
  },

  /**
   * 注释配置
   */
  comments: {
    // 是否生成JSDoc注释
    generateJSDoc: true,
    // 是否包含参数描述
    includeParamDescriptions: true,
    // 是否包含响应类型描述
    includeResponseType: true,
    // 是否包含弃用警告
    includeDeprecationWarnings: true,
  },

  /**
   * 类型配置（TypeScript或JSDoc类型）
   */
  types: {
    // 是否生成接口定义
    generateInterfaces: true,
    // 接口命名前缀
    interfacePrefix: 'I',
    // 接口命名后缀
    interfaceSuffix: '',
    // 是否导出类型定义
    exportTypes: true,
  },

  /**
   * 高级选项
   */
  advanced: {
    // 自定义模板路径
    templates: {
      // 请求函数模板
      apiFunction: null,
      // 类型定义模板
      typeDefinition: null,
      // 自定义文件模板
      customFile: null,
    },
    // 自定义类型映射
    typeMapping: {
      // 例如: 'string-date': 'Date',
    },
    // 自定义函数修饰符
    functionDecorators: [],
    // 请求前处理钩子
    beforeRequest: null,
    // 请求后处理钩子
    afterRequest: null,
  },
};`;
        }
        
        // 写入配置文件
        fs.writeFileSync(fullConfigPath, templateContent, 'utf8');
        
        // 打开配置文件
        const document = await vscode.workspace.openTextDocument(fullConfigPath);
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage(`配置文件 ${configFilePath} 已创建`);
    } catch (error) {
        vscode.window.showErrorMessage(`创建配置文件失败: ${error.message}`);
        console.error("创建配置文件错误:", error);
    }
}

/**
 * 选择Swagger数据来源类型
 * @returns {Promise<string|undefined>} 选择的来源类型或undefined（用户取消）
 */
async function selectSourceType() {
    const sourceTypes = [
        { label: "文件", description: "从本地JSON文件导入" },
        { label: "URL", description: "从远程URL导入" }
    ];

    const selected = await vscode.window.showQuickPick(sourceTypes, {
        placeHolder: '请选择Swagger数据来源',
        ignoreFocusOut: true
    });

    return selected?.label;
}

/**
 * 根据来源类型获取Swagger数据
 * @param {string} sourceType 来源类型：'文件'或'URL'
 * @returns {Promise<string|null>} Swagger数据源（文件路径或URL）
 */
async function getSwaggerSource(sourceType) {
    if (sourceType === '文件') {
        return await getSwaggerFromFile();
    } else if (sourceType === 'URL') {
        return await getSwaggerFromUrl();
    }
    return null;
}

/**
 * 从文件获取Swagger数据
 * @returns {Promise<string|null>} 文件路径或null（用户取消）
 */
async function getSwaggerFromFile() {
    const options = {
        canSelectMany: false,
        openLabel: '选择Swagger JSON文件',
        filters: { 
            'JSON文件': ['json'],
            '所有文件': ['*']
        }
    };

    const fileUris = await vscode.window.showOpenDialog(options);
    
    if (!fileUris || fileUris.length === 0) {
        return null;
    }

    return fileUris[0].fsPath;
}

/**
 * 从URL获取Swagger数据
 * @returns {Promise<string|null>} URL或null（用户取消）
 */
async function getSwaggerFromUrl() {
    const options = {
        prompt: '请输入Swagger JSON URL',
        placeHolder: 'https://example.com/api-docs',
        ignoreFocusOut: true,
        validateInput: validateUrl
    };

    return await vscode.window.showInputBox(options);
}

/**
 * 验证URL是否有效
 * @param {string} value 用户输入的URL
 * @returns {string|null} 错误消息或null（验证通过）
 */
function validateUrl(value) {
    if (!value || value.trim() === '') {
        return 'URL不能为空';
    }

    try {
        new URL(value);
        return null; // 验证通过
    } catch (e) {
        return '请输入有效的URL';
    }
}

/**
 * 选择API文件输出目录
 * @returns {Promise<string|null>} 目录路径或null（用户取消）
 */
async function selectOutputDirectory() {
    const options = {
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: '选择输出目录',
        title: '选择API文件输出目录'
    };

    const folderUris = await vscode.window.showOpenDialog(options);
    
    if (!folderUris || folderUris.length === 0) {
        return null;
    }

    return folderUris[0].fsPath;
}

/**
 * 插件停用时被调用
 */
function deactivate() {
    console.log('Swagger to Axios 插件已停用');
}

// 导出模块
module.exports = {
    activate,
    deactivate
};