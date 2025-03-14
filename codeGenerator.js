"use strict";

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const url = require('url');

// JavaScript保留字和关键字列表
const JS_RESERVED_KEYWORDS = [
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
  'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'let', 'static', 'enum', 'await', 'implements', 'package', 'protected',
  'interface', 'private', 'public', 'null', 'true', 'false', 'undefined',
  'NaN', 'Infinity', 'arguments', 'eval', 'get', 'set', 'then', 'object'
];

/**
 * 从文件或URL获取Swagger数据
 * @param {string} source - 文件路径或URL
 * @returns {Promise<object>} - Swagger数据对象
 */
async function getSwaggerData(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return fetchSwaggerFromUrl(source);
  } else {
    return readSwaggerFromFile(source);
  }
}

/**
 * 从URL获取Swagger数据
 * @param {string} swaggerUrl - Swagger文档URL
 * @returns {Promise<object>} - Swagger数据对象
 */
function fetchSwaggerFromUrl(swaggerUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(swaggerUrl);
    const httpModule = swaggerUrl.startsWith('https://') ? https : http;
    
    const request = httpModule.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: 'GET'
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        try {
          const swaggerData = JSON.parse(data);
          resolve(swaggerData);
        } catch (error) {
          reject(new Error(`无法解析Swagger JSON: ${error.message}`));
        }
      });
    });
    
    request.on('error', (error) => {
      reject(new Error(`请求Swagger URL失败: ${error.message}`));
    });
    
    request.end();
  });
}

/**
 * 从文件读取Swagger数据
 * @param {string} filePath - Swagger文件路径
 * @returns {Promise<object>} - Swagger数据对象
 */
function readSwaggerFromFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(new Error(`读取Swagger文件失败: ${err.message}`));
        return;
      }
      try {
        const swaggerData = JSON.parse(data);
        resolve(swaggerData);
      } catch (error) {
        reject(new Error(`解析Swagger JSON失败: ${error.message}`));
      }
    });
  });
}

/**
 * 生成API文件对（generated 与 custom）
 * @param {object|string} swaggerData - Swagger数据对象或路径/URL
 * @param {string} outputDir - 输出目录
 */
async function generateAxiosFiles(swaggerData, outputDir) {
  try {
    if (typeof swaggerData === 'string') {
      swaggerData = await getSwaggerData(swaggerData);
    }
    
    const basePath = (swaggerData.basePath || '').replace(/\/$/, '');
    const paths = swaggerData.paths || {};
    const tagsMap = {};
    
    // 按标签分类API
    categorizeApisByTags(paths, tagsMap);
    
    // 确保输出目录存在
    ensureDirectoryExists(outputDir);
    
    // 为各个标签生成API文件对（.generated.js 和 .custom.js）
    await generateApiFilesForTags(tagsMap, basePath, outputDir);
    
    return { success: true, message: 'API文件生成成功' };
  } catch (error) {
    throw new Error(`生成API文件失败: ${error.message}`);
  }
}

/**
 * 按标签分类API
 * @param {object} paths - Swagger路径对象
 * @param {object} tagsMap - 标签映射对象，将被修改
 */
function categorizeApisByTags(paths, tagsMap) {
  Object.entries(paths).forEach(([apiPath, methods]) => {
    Object.entries(methods).forEach(([method, operation]) => {
      if (!operation.tags || operation.tags.length === 0) return;
      const tag = operation.tags[0];
      if (!tagsMap[tag]) {
        tagsMap[tag] = [];
      }
      tagsMap[tag].push({ 
        path: apiPath, 
        method: method.toLowerCase(), 
        operation 
      });
    });
  });
}

/**
 * 确保目录存在，如不存在则创建
 * @param {string} directory - 目录路径
 */
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

/**
 * 为所有标签生成API文件对：每个标签生成 .generated.js 和对应的 .custom.js（如果自定义文件不存在）
 * @param {object} tagsMap - 标签映射对象
 * @param {string} basePath - API基础路径
 * @param {string} outputDir - 输出目录
 */
async function generateApiFilesForTags(tagsMap, basePath, outputDir) {
  for (const [tag, operations] of Object.entries(tagsMap)) {
    const sanitizedTag = sanitizeTagName(tag);
    // 生成自动生成文件，文件名格式：{sanitizedTag}.generated.js
    const generatedFileContent = generateApiFileContent(operations, tag);
    const generatedFilePath = path.join(outputDir, `${sanitizedTag}.generated.js`);
    fs.writeFileSync(generatedFilePath, generatedFileContent, 'utf8');
    
    // 如果对应的自定义文件不存在，则生成默认模板
    const customFilePath = path.join(outputDir, `${sanitizedTag}.custom.js`);
    if (!fs.existsSync(customFilePath)) {
      const customContent = generateCustomFileTemplate(sanitizedTag, tag);
      fs.writeFileSync(customFilePath, customContent, 'utf8');
    }
  }
}

/**
 * 生成自定义文件模板
 * @param {string} sanitizedTag - 清洗后的tag名称（用于文件名）
 * @param {string} tag - 原始tag名称（用于提示信息）
 * @returns {string} - 自定义文件模板内容
 */
function generateCustomFileTemplate(sanitizedTag, tag) {
  return `/**
 * 该文件用于对 ${tag} 模块的自动生成 API 接口进行自定义扩展，
 * 请勿直接修改 ${sanitizedTag}.generated.js 文件。
 */

// 重新导出所有自动生成的接口
export * from './${sanitizedTag}.generated';

// 在这里覆盖或扩展需要定制的接口，例如：
// export function someApi(...args) {
//   // 自定义逻辑
//   return require('./${sanitizedTag}.generated').someApi(...args);
// }
`;
}

/**
 * 生成API文件内容
 * @param {Array} operations - API操作数组
 * @param {string} tag - API标签
 * @returns {string} - 文件内容
 */
function generateApiFileContent(operations, tag) {
  let fileContent = '';
  
  // 标准导入
  fileContent += "import request from '@/utils/request';\n";
  fileContent += "import { basePath } from '../base';\n";
  fileContent += "import { moduleNormal } from './module';\n\n";
  fileContent += "const path0 = `${basePath}`;\n";
  fileContent += "const path = `${basePath}/${moduleNormal}`;\n\n";
  
  const usedFunctionNames = new Set();
  
  operations.forEach(op => {
    const { path: apiPath, method, operation } = op;
    const funcName = getSafeFunctionName(operation, usedFunctionNames);
    const paramsList = generateParamsList(operation);
    const jsDocComment = generateJSDocComment(operation);
    fileContent += jsDocComment;
    fileContent += `export function ${funcName}(${paramsList}) {\n`;
    const urlTemplate = generateUrlTemplate(apiPath, operation);
    fileContent += `  const url = \`${urlTemplate}\`;\n`;
    fileContent += generateRequestCall(method, operation);
    fileContent += `}\n\n`;
  });
  
  return fileContent;
}

/**
 * 获取安全的函数名（非保留字/关键字，无冲突）
 * @param {object} operation - API操作对象
 * @param {Set} usedNames - 已使用的函数名集合
 * @returns {string} - 安全的函数名
 */
function getSafeFunctionName(operation, usedNames) {
  let name = cleanFunctionName(operation);
  if (JS_RESERVED_KEYWORDS.includes(name)) {
    name += 'Api';
  }
  let uniqueName = name;
  let counter = 1;
  while (usedNames.has(uniqueName)) {
    uniqueName = `${name}${counter}`;
    counter++;
  }
  usedNames.add(uniqueName);
  return uniqueName;
}

/**
 * 清理并生成基础函数名
 * @param {object} operation - API操作对象
 * @returns {string} - 清理后的函数名
 */
function cleanFunctionName(operation) {
  if (operation.operationId) {
    let name = operation.operationId
               .replace(/Using(POST|GET|PUT|DELETE|PATCH)(_\d+)?$/i, '')
               .replace(/_\d+$/, '');
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  return operation.summary 
    ? operation.summary
        .toLowerCase()
        .replace(/\s+(.)/g, (match, char) => char.toUpperCase())
        .replace(/\s/g, '')
    : 'unnamedFunction';
}

/**
 * 生成JSDoc注释
 * @param {object} operation - API操作对象
 * @returns {string} - JSDoc注释字符串
 */
function generateJSDocComment(operation) {
  let comment = '/**\n';
  if (operation.description || operation.summary) {
    comment += ` * ${operation.description || operation.summary}\n`;
  }
  if (operation.parameters && operation.parameters.length > 0) {
    comment += ' *\n';
    operation.parameters
      .filter(p => p.in === 'path')
      .forEach(param => {
        comment += ` * @param {${mapSwaggerTypeToJSType(param)}} ${param.name} ${param.description || ''}\n`;
      });
    const queryParams = operation.parameters.filter(p => p.in === 'query');
    if (queryParams.length > 0) {
      comment += ` * @param {object} params 查询参数\n`;
      queryParams.forEach(param => {
        comment += ` * @param {${mapSwaggerTypeToJSType(param)}} params.${param.name} ${param.description || ''}\n`;
      });
    }
    const bodyParams = operation.parameters.filter(p => p.in === 'body' || p.in === 'formData');
    if (bodyParams.length > 0) {
      comment += ` * @param {object} data 请求数据\n`;
      bodyParams.forEach(param => {
        if (param.in === 'body' && param.schema) {
          if (param.schema.$ref) {
            const typeName = param.schema.$ref.split('/').pop();
            comment += ` * @param {${typeName}} data 请求体数据 ${param.description || ''}\n`;
          } else {
            comment += ` * @param {object} data 请求体数据 ${param.description || ''}\n`;
          }
        } else {
          comment += ` * @param {${mapSwaggerTypeToJSType(param)}} data.${param.name} ${param.description || ''}\n`;
        }
      });
    }
  }
  if (operation.responses) {
    const successResponse = operation.responses['200'] || operation.responses['201'];
    if (successResponse) {
      let returnType = 'Promise<any>';
      if (successResponse.schema) {
        if (successResponse.schema.$ref) {
          const typeName = successResponse.schema.$ref.split('/').pop();
          returnType = `Promise<${typeName}>`;
        } else if (successResponse.schema.type === 'array' && successResponse.schema.items) {
          if (successResponse.schema.items.$ref) {
            const typeName = successResponse.schema.items.$ref.split('/').pop();
            returnType = `Promise<${typeName}[]>`;
          } else {
            returnType = `Promise<${mapSwaggerTypeToJSType(successResponse.schema.items)}[]>`;
          }
        } else {
          returnType = `Promise<${mapSwaggerTypeToJSType(successResponse.schema)}>`;
        }
      }
      comment += ` * @returns {${returnType}} ${successResponse.description || '请求响应'}\n`;
    } else {
      comment += ` * @returns {Promise<any>} 请求响应\n`;
    }
  } else {
    comment += ` * @returns {Promise<any>} 请求响应\n`;
  }
  comment += ' */\n';
  return comment;
}

/**
 * 将Swagger类型映射为JavaScript类型
 * @param {object} param - Swagger参数对象
 * @returns {string} - JavaScript类型
 */
function mapSwaggerTypeToJSType(param) {
  if (!param.type && param.schema) {
    if (param.schema.$ref) {
      return param.schema.$ref.split('/').pop();
    }
    param = param.schema;
  }
  switch (param.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (param.items) {
        if (param.items.$ref) {
          const itemType = param.items.$ref.split('/').pop();
          return `${itemType}[]`;
        }
        return `${mapSwaggerTypeToJSType(param.items)}[]`;
      }
      return 'any[]';
    case 'object':
    case 'file':
      return 'object';
    case 'string':
    default:
      return 'string';
  }
}

/**
 * 生成URL模板
 * @param {string} apiPath - API路径
 * @param {object} operation - API操作对象
 * @returns {string} - URL模板
 */
function generateUrlTemplate(apiPath, operation) {
  let urlTemplate = `\${path}${apiPath}`;
  if (operation.parameters) {
    operation.parameters
      .filter(p => p.in === 'path')
      .forEach(p => {
        const name = p.name;
        urlTemplate = urlTemplate.replace(`{${name}}`, `\${${name}}`);
      });
  }
  return urlTemplate;
}

/**
 * 生成请求调用代码
 * @param {string} method - HTTP方法
 * @param {object} operation - API操作对象
 * @returns {string} - 请求调用代码
 */
function generateRequestCall(method, operation) {
  const hasQuery = operation.parameters && operation.parameters.some(p => p.in === 'query');
  const hasBody = operation.parameters && operation.parameters.some(p => p.in === 'body' || p.in === 'formData');
  let requestCode = '  return request({\n';
  requestCode += '    url,\n';
  requestCode += `    method: '${method.toUpperCase()}',\n`;
  if (hasQuery) {
    requestCode += '    params,\n';
  }
  if (hasBody) {
    requestCode += '    data,\n';
  }
  requestCode += '  });\n';
  return requestCode;
}

/**
 * 生成函数参数列表
 * @param {object} operation - API操作对象
 * @returns {string} - 参数列表字符串
 */
function generateParamsList(operation) {
  const params = [];
  if (operation.parameters) {
    operation.parameters.filter(p => p.in === 'path')
      .forEach(p => params.push(p.name));
    if (operation.parameters.some(p => p.in === 'query')) {
      params.push('params');
    }
    if (operation.parameters.some(p => p.in === 'body' || p.in === 'formData')) {
      params.push('data');
    }
  }
  return params.join(', ');
}

/**
 * 将tag名称规范化为合法的文件名
 * @param {string} tag - API标签
 * @returns {string} - 合法的文件名
 */
function sanitizeTagName(tag) {
  return tag.replace(/[\\\/:*?"<>|]/g, '_');
}

// 导出主要函数
exports.generateAxiosFiles = generateAxiosFiles;
