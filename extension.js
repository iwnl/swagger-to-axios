"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { generateAxiosFiles } = require("./codeGenerator");

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

    // 将命令添加到订阅列表，确保插件停用时命令被正确处理
    context.subscriptions.push(convertCommand, setOutputDirCommand);
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
            // 1. 选择Swagger数据来源
            progress.report({ message: "选择Swagger数据来源..." });
            const sourceType = await selectSourceType();
            if (!sourceType) return;

            // 2. 获取Swagger数据
            progress.report({ message: "获取Swagger数据..." });
            const swaggerSource = await getSwaggerSource(sourceType);
            if (!swaggerSource) return;

            // 3. 选择输出目录
            progress.report({ message: "选择输出目录..." });
            const outputDir = await selectOutputDirectory();
            if (!outputDir) return;

            // 4. 生成API文件
            progress.report({ message: "生成API文件中..." });
            await generateAxiosFiles(swaggerSource, outputDir);

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