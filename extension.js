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
    console.log('插件目录:', __dirname);
    console.log('插件文件:', __filename);

    try {
        // 注册命令
        console.log('开始注册转换命令');
        const convertCommand = vscode.commands.registerCommand(
            'swaggerToAxios.convert', 
            handleConvertCommand
        );
        console.log('转换命令注册成功');

        // 注册配置界面命令
        console.log('开始注册配置界面命令');
        const configUiCommand = vscode.commands.registerCommand(
            'swaggerToAxios.openConfigUI',
            handleOpenConfigUI
        );
        console.log('配置界面命令注册成功');

        // 将命令添加到订阅列表，确保插件停用时命令被正确处理
        context.subscriptions.push(
            convertCommand, 
            configUiCommand
        );
        console.log('所有命令已添加到订阅列表');
        
        // 输出详细命令注册信息，便于调试
        console.log('已注册以下命令:');
        console.log('- swaggerToAxios.convert');
        console.log('- swaggerToAxios.openConfigUI');
    } catch (error) {
        console.error('注册命令失败:', error);
        vscode.window.showErrorMessage(`Swagger to Axios 插件激活失败: ${error.message}`);
    }
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
            
            // 处理带认证的swagger源
            let swagger;
            let authConfig = null;
            
            if (typeof swaggerSource === 'object' && swaggerSource.url) {
                swagger = swaggerSource.url;
                authConfig = swaggerSource.authConfig;
            } else {
                swagger = swaggerSource;
            }

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
            await generateAxiosFiles(swagger, outputDir, config, authConfig);

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

    const swaggerUrl = await vscode.window.showInputBox(options);
    if (!swaggerUrl) return null;
    
    // 询问是否需要认证
    const needAuth = await vscode.window.showQuickPick(['是', '否'], {
        placeHolder: '该Swagger接口是否需要认证?',
        ignoreFocusOut: true
    });
    
    if (needAuth !== '是') return swaggerUrl;
    
    // 选择认证类型
    const authType = await vscode.window.showQuickPick(
        ['Basic认证', 'Bearer Token认证', 'API Key认证', '自定义头部认证'], {
        placeHolder: '请选择认证类型',
        ignoreFocusOut: true
    });
    
    let authConfig = { type: '', credentials: {} };
    
    switch (authType) {
        case 'Basic认证':
            authConfig.type = 'basic';
            const username = await vscode.window.showInputBox({
                prompt: '请输入用户名',
                ignoreFocusOut: true
            });
            if (!username) return null;
            
            const password = await vscode.window.showInputBox({
                prompt: '请输入密码',
                password: true,
                ignoreFocusOut: true
            });
            if (!password) return null;
            
            authConfig.credentials = { username, password };
            break;
            
        case 'Bearer Token认证':
            authConfig.type = 'bearer';
            const token = await vscode.window.showInputBox({
                prompt: '请输入Bearer Token',
                ignoreFocusOut: true
            });
            if (!token) return null;
            
            authConfig.credentials = { token };
            break;
            
        case 'API Key认证':
            authConfig.type = 'apikey';
            const apiKeyName = await vscode.window.showInputBox({
                prompt: '请输入API Key名称',
                ignoreFocusOut: true
            });
            if (!apiKeyName) return null;
            
            const apiKeyValue = await vscode.window.showInputBox({
                prompt: '请输入API Key值',
                ignoreFocusOut: true
            });
            if (!apiKeyValue) return null;
            
            const apiKeyIn = await vscode.window.showQuickPick(['header', 'query'], {
                placeHolder: 'API Key放在哪里?',
                ignoreFocusOut: true
            });
            if (!apiKeyIn) return null;
            
            authConfig.credentials = { 
                name: apiKeyName, 
                value: apiKeyValue,
                in: apiKeyIn
            };
            break;
            
        case '自定义头部认证':
            authConfig.type = 'custom';
            const headerName = await vscode.window.showInputBox({
                prompt: '请输入自定义头部名称',
                ignoreFocusOut: true
            });
            if (!headerName) return null;
            
            const headerValue = await vscode.window.showInputBox({
                prompt: '请输入自定义头部值',
                ignoreFocusOut: true
            });
            if (!headerValue) return null;
            
            authConfig.credentials = { [headerName]: headerValue };
            break;
            
        default:
            return swaggerUrl;
    }
    
    // 返回URL和认证配置的对象
    return { url: swaggerUrl, authConfig };
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
 * 打开配置UI界面
 * @returns {Promise<void>}
 */
async function handleOpenConfigUI() {
    try {
        console.log('开始执行handleOpenConfigUI函数');
        
        // 先显示一个简单的测试消息，确认命令可以工作
        vscode.window.showInformationMessage('Swagger to Axios 配置界面命令已触发');
        console.log('显示消息: Swagger to Axios 配置界面命令已触发');
        
        // 获取工作区根目录
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        console.log('工作区根目录:', workspaceRoot);
        
        if (!workspaceRoot) {
            throw new Error("未打开工作区，请先打开一个项目文件夹");
        }

        // 创建新的面板
        console.log('开始创建WebView面板');
        const panel = vscode.window.createWebviewPanel(
            'swaggerToAxiosConfig',          // 内部ID
            'Swagger to Axios 配置',         // 标题
            vscode.ViewColumn.One,           // 显示在编辑器的哪一列
            {
                enableScripts: true,         // 启用JS
                retainContextWhenHidden: true // 隐藏时保留状态
            }
        );
        console.log('WebView面板创建成功');

        // 获取当前配置
        console.log('开始加载配置');
        const config = loadConfiguration(workspaceRoot);
        console.log('配置加载成功', config ? '有配置' : '无配置');

        // 获取nonce值用于内容安全策略
        const nonce = getNonce();
        console.log('获取nonce值成功');
        
        // 读取HTML内容
        console.log('开始读取HTML文件');
        const htmlPath = path.join(__dirname, 'configView.html');
        console.log('HTML文件路径:', htmlPath);
        console.log('HTML文件是否存在:', fs.existsSync(htmlPath) ? '存在' : '不存在');
        
        let htmlContent;
        try {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
            console.log('HTML内容读取成功, 长度:', htmlContent.length);
            
            // 确保HTML内容有效
            if (!htmlContent || htmlContent.trim() === '') {
                throw new Error('HTML文件内容为空');
            }
            
            // 简单验证HTML结构
            if (!htmlContent.includes('<!DOCTYPE html>') && !htmlContent.includes('<html')) {
                throw new Error('HTML文件格式无效');
            }
        } catch (readError) {
            console.error('读取HTML文件失败:', readError);
            throw new Error(`读取配置界面HTML文件失败: ${readError.message}`);
        }
        
        // 将HTML内容设置到webview
        console.log('开始设置HTML内容到WebView');
        try {
            panel.webview.html = htmlContent;
            console.log('HTML内容设置成功');
        } catch (webviewError) {
            console.error('设置WebView HTML内容失败:', webviewError);
            throw new Error(`设置WebView HTML内容失败: ${webviewError.message}`);
        }

        // 处理来自WebView的消息
        console.log('开始设置WebView消息处理器');
        panel.webview.onDidReceiveMessage(async (message) => {
            try {
                console.log('收到WebView消息:', message?.command);
                if (message.command === 'saveConfig') {
                    console.log('处理保存配置命令');
                    // 保存配置
                    const configPath = path.join(workspaceRoot, 'swagger-to-axios.config.js');
                    const configData = message.config;
                    
                    // 将配置转换为JS模块格式
                    const configContent = `module.exports = ${JSON.stringify(configData, null, 2)};`;
                    
                    // 写入配置文件
                    fs.writeFileSync(configPath, configContent, 'utf8');
                    console.log('配置文件已保存到:', configPath);
                    
                    // 发送成功消息
                    vscode.window.showInformationMessage('配置已保存到: ' + configPath);
                    
                    // 通知webview保存成功
                    panel.webview.postMessage({ command: 'saveSuccess' });
                    console.log('已发送保存成功消息到WebView');
                }
                else if (message.command === 'loadConfig') {
                    console.log('处理加载配置命令');
                    // 发送当前配置到webview
                    panel.webview.postMessage({ 
                        command: 'setConfig', 
                        config: config 
                    });
                    console.log('已发送配置到WebView');
                }
                else if (message.command === 'getConfig') {
                    console.log('处理获取配置命令');
                    // 获取当前配置
                    const currentConfig = loadConfiguration(workspaceRoot);
                    
                    // 发送配置到webview
                    panel.webview.postMessage({
                        command: 'setConfig',
                        config: currentConfig
                    });
                    console.log('已发送当前配置到WebView');
                }
                else if (message.command === 'getDefaultConfig') {
                    console.log('处理获取默认配置命令');
                    
                    // 发送默认配置到webview
                    panel.webview.postMessage({
                        command: 'setConfig',
                        config: defaultConfig
                    });
                    console.log('已发送默认配置到WebView');
                }
            } catch (error) {
                console.error('处理WebView消息失败:', error);
                vscode.window.showErrorMessage(`处理配置失败: ${error.message}`);
                
                // 通知webview出错
                panel.webview.postMessage({ 
                    command: 'error', 
                    message: error.message 
                });
                console.log('已发送错误消息到WebView');
            }
        });
        console.log('WebView消息处理器设置成功');
        console.log('handleOpenConfigUI执行完毕');
    } catch (error) {
        console.error('打开配置界面失败, 错误类型:', typeof error, '错误详情:', error);
        vscode.window.showErrorMessage(`打开配置界面失败: ${error.message}`);
    }
}

/**
 * 生成随机nonce值用于内容安全策略
 * @returns {string} 随机nonce值
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
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