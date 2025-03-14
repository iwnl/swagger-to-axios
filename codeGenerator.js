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
  // 检查是否为URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return fetchSwaggerFromUrl(source);
  } else {
    // 否则视为文件路径
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
 * 生成API文件
 * @param {object|string} swaggerData - Swagger数据对象或路径/URL
 * @param {string} outputDir - 输出目录
 */
async function generateAxiosFiles(swaggerData, outputDir) {
  try {
    // 如果swaggerData是字符串，则尝试获取数据
    if (typeof swaggerData === 'string') {
      swaggerData = await getSwaggerData(swaggerData);
    }
    
    // 解析 Swagger 数据
    const basePath = (swaggerData.basePath || '').replace(/\/$/, '');
    const paths = swaggerData.paths || {};
    const tagsMap = {};

    // 按标签分类API
    categorizeApisByTags(paths, tagsMap);
    
    // 确保输出目录存在
    ensureDirectoryExists(outputDir);
    
    // 为每个标签生成API文件
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
 * 为所有标签生成API文件
 * @param {object} tagsMap - 标签映射对象
 * @param {string} basePath - API基础路径
 * @param {string} outputDir - 输出目录
 */
async function generateApiFilesForTags(tagsMap, basePath, outputDir) {
  for (const [tag, operations] of Object.entries(tagsMap)) {
    const fileContent = generateApiFileContent(operations, tag);
    
    // 写入文件
    const filePath = path.join(outputDir, `${sanitizeTagName(tag)}.js`);
    fs.writeFileSync(filePath, fileContent, 'utf8');
  }
}

/**
 * 生成API文件内容
 * @param {Array} operations - API操作数组
 * @param {string} tag - API标签
 * @returns {string} - 文件内容
 */
function generateApiFileContent(operations, tag) {
  let fileContent = '';
  
  // 保留标准导入头
  fileContent += "import request from '@/utils/request';\n";
  fileContent += "import { basePath } from '../base';\n";
  fileContent += `import { moduleNormal } from './module';\n\n`;
  fileContent += "const path0 = ${basePath};\n";
  fileContent += "const path = ${basePath}/${moduleNormal};\n\n";
  
  // 记录已使用的函数名，避免冲突
  const usedFunctionNames = new Set();
  
  // 生成每个API函数
  operations.forEach(op => {
    const { path: apiPath, method, operation } = op;
    
    // 生成函数名，避免关键字和重复
    const funcName = getSafeFunctionName(operation, usedFunctionNames);
    
    // 生成参数列表
    const paramsList = generateParamsList(operation);
    
    // 生成JSDoc注释
    const jsDocComment = generateJSDocComment(operation);
    fileContent += jsDocComment;
    
    // 生成函数定义
    fileContent += `export function ${funcName}(${paramsList}) {\n`;
    
    // 构造URL
    const urlTemplate = generateUrlTemplate(apiPath, operation);
    fileContent += `  const url = \`${urlTemplate}\`;\n`;
    
    // 生成请求调用
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
  
  // 如果是关键字，添加Api后缀
  if (JS_RESERVED_KEYWORDS.includes(name)) {
    name += 'Api';
  }
  
  // 处理命名冲突
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
  // 如果有operationId，使用它；否则根据summary生成
  if (operation.operationId) {
    // 移除Using[HTTP方法]后缀和数字后缀
    let name = operation.operationId
               .replace(/Using(POST|GET|PUT|DELETE|PATCH)(_\d+)?$/i, '')
               .replace(/_\d+$/, ''); // 移除末尾的_数字后缀
    
    // 确保首字母小写（符合驼峰命名）
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  
  // 简单转换：去空格转驼峰
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
  
  // 添加函数描述
  if (operation.description || operation.summary) {
    comment += ` * ${operation.description || operation.summary}\n`;
  }
  
  // 添加参数描述
  if (operation.parameters && operation.parameters.length > 0) {
    comment += ' *\n';
    
    // 处理路径参数
    operation.parameters
      .filter(p => p.in === 'path')
      .forEach(param => {
        comment += ` * @param {${mapSwaggerTypeToJSType(param)}} ${param.name} ${param.description || ''}\n`;
      });
    
    // 处理查询参数
    const queryParams = operation.parameters.filter(p => p.in === 'query');
    if (queryParams.length > 0) {
      comment += ` * @param {object} params 查询参数\n`;
      queryParams.forEach(param => {
        comment += ` * @param {${mapSwaggerTypeToJSType(param)}} params.${param.name} ${param.description || ''}\n`;
      });
    }
    
    // 处理请求体参数
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
  
  // 添加返回值描述
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
 * 添加操作描述注释
 * @param {object} operation - API操作对象
 * @param {string} fileContent - 文件内容，将被修改
 */
function addOperationDescription(operation, fileContent) {
  if (operation.description) {
    fileContent += `// ${operation.description}\n`;
  } else if (operation.summary) {
    fileContent += `// ${operation.summary}\n`;
  }
}

/**
 * 生成URL模板
 * @param {string} apiPath - API路径
 * @param {object} operation - API操作对象
 * @returns {string} - URL模板
 */
function generateUrlTemplate(apiPath, operation) {
  // 使用path变量作为basePath
  let urlTemplate = `\${path}${apiPath}`;
  
  // 替换路径参数
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
 * 生成函数名
 * @param {object} operation - API操作对象
 * @returns {string} - 函数名
 */
function generateFunctionName(operation) {
  // 如果有operationId，使用它；否则根据summary生成
  if (operation.operationId) {
    return operation.operationId.replace(/Using(POST|GET|PUT|DELETE)$/i, '');
  }
  
  // 简单转换：去空格转驼峰
  return operation.summary 
    ? operation.summary.replace(/\s+(.)/g, (match, char) => char.toUpperCase()).replace(/\s/g, '')
    : 'unnamedFunction';
}

/**
 * 生成函数参数列表
 * @param {object} operation - API操作对象
 * @returns {string} - 参数列表字符串
 */
function generateParamsList(operation) {
  const params = [];
  
  if (operation.parameters) {
    // 路径参数：逐个添加
    operation.parameters.filter(p => p.in === 'path')
      .forEach(p => params.push(p.name));
    
    // 如果有query参数，统一加入params对象
    if (operation.parameters.some(p => p.in === 'query')) {
      params.push('params');
    }
    
    // 如果有请求体，则加入data参数
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