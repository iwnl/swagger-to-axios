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
 * @param {object} authConfig - 认证配置
 * @returns {Promise<object>} - Swagger数据对象
 */
async function getSwaggerData(source, authConfig = {}) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return fetchSwaggerFromUrl(source, authConfig);
  } else {
    return readSwaggerFromFile(source);
  }
}

/**
 * 从URL获取Swagger数据
 * @param {string} swaggerUrl - Swagger文档URL
 * @param {object} authConfig - 认证配置 {type, credentials}
 * @returns {Promise<object>} - Swagger数据对象
 */
function fetchSwaggerFromUrl(swaggerUrl, authConfig = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(swaggerUrl);
    const httpModule = swaggerUrl.startsWith('https://') ? https : http;
    
    // 添加API Key查询参数（如果需要）
    let apiPath = parsedUrl.path;
    if (authConfig.type === 'apikey' && 
        authConfig.credentials && 
        authConfig.credentials.in === 'query' &&
        authConfig.credentials.name &&
        authConfig.credentials.value) {
      
      const separator = apiPath.includes('?') ? '&' : '?';
      apiPath = `${apiPath}${separator}${authConfig.credentials.name}=${encodeURIComponent(authConfig.credentials.value)}`;
    }
    
    // 设置请求选项，添加适当的请求头
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: apiPath,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 Swagger API Generator',
        'Accept': 'application/json, */*',
        'Accept-Encoding': 'identity'  // 不要压缩内容
      }
    };
    
    // 添加认证头
    if (authConfig && authConfig.type) {
      addAuthHeaders(options.headers, authConfig);
    }
    
    // 打印请求信息（调试用）
    console.log(`正在请求: ${swaggerUrl}`);
    console.log('请求头:', JSON.stringify(options.headers, null, 2));
    
    const request = httpModule.request(options, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        if (response.headers.location) {
          console.log(`收到重定向，正在跟随重定向到: ${response.headers.location}`);
          return fetchSwaggerFromUrl(response.headers.location, authConfig)
            .then(resolve)
            .catch(reject);
        } else {
          return reject(new Error(`收到重定向响应(${response.statusCode})，但没有location头`));
        }
      }
      
      // 检查HTTP状态码
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP请求失败，状态码: ${response.statusCode}`));
      }
      
      // 检查内容类型
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('application/json') && 
          !contentType.includes('text/plain') && 
          !contentType.includes('text/yaml')) {
        console.warn(`警告: 响应内容类型不是JSON (${contentType})，尝试继续解析...`);
      }
      
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          // 尝试处理响应数据
          if (!data || data.trim() === '') {
            return reject(new Error('服务器返回了空响应'));
          }
          
          let swaggerData;
          
          // 尝试解析JSON
          try {
            swaggerData = JSON.parse(data);
          } catch (jsonError) {
            // 如果不是有效的JSON，且看起来像YAML，添加提示
            if (data.includes(':') && data.includes('\n')) {
              return reject(new Error(`无法解析为JSON，可能是YAML格式。请先转换为JSON: ${jsonError.message}`));
            }
            
            // 如果看起来像HTML，给出更明确的错误
            if (data.includes('<html>') || data.includes('<!DOCTYPE')) {
              return reject(new Error(`收到HTML响应而非JSON。可能是URL错误或需要认证`));
            }
            
            // 未知格式错误
            return reject(new Error(`无法解析Swagger JSON: ${jsonError.message}`));
          }
          
          // 验证是否看起来像Swagger文档
          if (!swaggerData.swagger && !swaggerData.openapi && !swaggerData.paths) {
            console.warn('警告: 响应看起来不像有效的Swagger/OpenAPI文档');
          }
          
          resolve(swaggerData);
        } catch (error) {
          reject(new Error(`处理Swagger数据时出错: ${error.message}`));
        }
      });
    });
    
    // 设置请求超时
    request.setTimeout(30000, () => {
      request.abort();
      reject(new Error('请求超时(30秒)'));
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
 * 添加认证头到请求
 * @param {object} headers - 请求头对象
 * @param {object} authConfig - 认证配置
 */
function addAuthHeaders(headers, authConfig) {
  const { type, credentials } = authConfig;
  
  switch (type.toLowerCase()) {
    case 'basic':
      // Basic认证: 用户名/密码
      if (credentials && credentials.username && credentials.password) {
        const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }
      break;
      
    case 'bearer':
    case 'token':
      // Bearer Token认证
      if (credentials && credentials.token) {
        headers['Authorization'] = `Bearer ${credentials.token}`;
      }
      break;
      
    case 'apikey':
      // API Key认证
      if (credentials && credentials.name && credentials.value) {
        // API key可能在header或query参数中
        if (credentials.in === 'query') {
          // 这种情况需要在URL中添加参数，而不是在头部
          // 由调用方处理
        } else {
          // 默认放在header中
          headers[credentials.name] = credentials.value;
        }
      }
      break;
      
    case 'custom':
      // 自定义头部认证
      if (credentials && typeof credentials === 'object') {
        // 添加所有提供的自定义头部
        Object.entries(credentials).forEach(([key, value]) => {
          headers[key] = value;
        });
      }
      break;
  }
}

/**
 * 生成API文件对（.generated.js 与 .custom.js）
 * @param {string} source - Swagger数据源（文件路径或URL）
 * @param {string} outputDir - 输出目录
 * @param {object} config - 配置选项
 * @param {object} authConfig - 认证配置选项
 * @returns {Promise<void>}
 */
async function generateAxiosFiles(source, outputDir, config = {}, authConfig = null) {
  try {
    // 获取Swagger数据
    const swaggerData = await getSwaggerData(source, authConfig);
    // 保存definitions到全局变量，供后续展开schema使用
    global.swaggerDefinitions = swaggerData.definitions || {};
    
    const basePath = config.imports?.basePath || (swaggerData.basePath || '').replace(/\/$/, '');
    const paths = swaggerData.paths || {};
    const tagsMap = {};
    
    // 按标签分类API
    categorizeApisByTags(paths, tagsMap);
    
    // 确保输出目录存在
    ensureDirectoryExists(outputDir);
    
    // 如果配置为清空输出目录
    if (config.output?.cleanOutputDir) {
      cleanDirectory(outputDir, config);
    }
    
    // 为各个标签生成API文件对（.generated.js 和 .custom.js）
    await generateApiFilesForTags(tagsMap, basePath, outputDir, config);
    
    return { success: true, message: 'API文件生成成功' };
  } catch (error) {
    throw new Error(`生成API文件失败: ${error.message}`);
  }
}

/**
 * 清空目录，但保留自定义文件
 * @param {string} directory - 目录路径
 * @param {object} config - 配置选项
 */
function cleanDirectory(directory, config) {
  // 只删除生成的文件，保留自定义文件
  const files = fs.readdirSync(directory);
  const generatedPattern = config.output?.fileNaming || '{{name}}.generated';
  const generatedSuffix = generatedPattern.replace('{{name}}', '');
  
  for (const file of files) {
    if (file.endsWith(generatedSuffix)) {
      fs.unlinkSync(path.join(directory, file));
    }
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
 * @param {object} config - 配置选项
 */
async function generateApiFilesForTags(tagsMap, basePath, outputDir, config) {
  const fileExtension = config.output?.useTypeScript ? '.ts' : (config.output?.fileExtension || '.js');
  
  for (const [tag, operations] of Object.entries(tagsMap)) {
    const sanitizedTag = sanitizeTagName(tag);
    
    // 生成文件名
    let generatedFileName = (config.output?.fileNaming || '{{name}}.generated')
      .replace('{{name}}', sanitizedTag);
    
    // 检查fileNaming是否已经包含扩展名
    if (!generatedFileName.endsWith('.js') && !generatedFileName.endsWith('.ts')) {
      generatedFileName += fileExtension;
    }
      
    let customFileName = (config.output?.customFileNaming || '{{name}}.custom')
      .replace('{{name}}', sanitizedTag);
    
    // 检查customFileNaming是否已经包含扩展名
    if (!customFileName.endsWith('.js') && !customFileName.endsWith('.ts')) {
      customFileName += fileExtension;
    }
    
    // 生成自动生成文件
    const generatedFileContent = generateApiFileContent(operations, tag, basePath, config);
    const generatedFilePath = path.join(outputDir, generatedFileName);
    fs.writeFileSync(generatedFilePath, generatedFileContent, 'utf8');
    
    // 如果对应的自定义文件不存在，则生成默认模板
    const customFilePath = path.join(outputDir, customFileName);
    if (!fs.existsSync(customFilePath)) {
      const customContent = generateCustomFileTemplate(sanitizedTag, tag, generatedFileName, config);
      fs.writeFileSync(customFilePath, customContent, 'utf8');
    }
  }
}

/**
 * 生成API文件内容
 * @param {Array} operations - API操作列表
 * @param {string} tag - API标签
 * @param {string} basePath - API基础路径
 * @param {object} config - 配置选项
 * @returns {string} - 生成的文件内容
 */
function generateApiFileContent(operations, tag, basePath, config = {}) {
  // 配置项
  const useTypeScript = config.output?.useTypeScript || false;
  const useSemicolons = config.codeStyle?.useSemicolons !== false;
  const useSingleQuotes = config.codeStyle?.useSingleQuotes !== false;
  const quotes = useSingleQuotes ? "'" : '"';
  const semi = useSemicolons ? ';' : '';
  const indentType = config.codeStyle?.indentType === 'tab' ? '\t' : ' ';
  const indentSize = config.codeStyle?.indentSize || 2;
  const indent = indentType.repeat(indentSize);
  const moduleNormal = config.imports?.moduleNormal || 'api';
  const configBasePath = config.imports?.basePath || '';
  
  // 导入语句
  let imports = [];
  imports.push(config.imports?.requestLibrary || `import request from ${quotes}@/utils/request${quotes}${semi}`);
  
  // 不再直接导入basePath和moduleNormal
  if (config.imports?.customImports) {
    imports = [...imports, ...config.imports.customImports];
  } else {
    // 默认导入
    imports.push(`import { basePath } from ${quotes}../base${quotes}${semi}`);
  }
  
  // 添加额外导入
  if (config.imports?.additionalImports && config.imports.additionalImports.length > 0) {
    imports = [...imports, ...config.imports.additionalImports];
  }

  // 类型定义部分
  let typeDefinitions = '';
  if (useTypeScript && config.types?.generateInterfaces) {
    // 这里可以添加TypeScript接口生成代码
  }
  
  // 生成API路径常量 - 使用测试期望的格式
  let content = imports.join('\n') + '\n\n';
  
  // 根据配置中的basePath和moduleNormal生成路径
  if (config.imports?.moduleNormal) {
    content += `const path = \${basePath}/${config.imports.moduleNormal}${semi}\n\n`;
  } else {
    content += `const path = ${quotes}${configBasePath}/${moduleNormal}${quotes}${semi}\n\n`;
  }
  
  // 添加类型定义（如果有）
  if (typeDefinitions) {
    content += typeDefinitions + '\n\n';
  }
  
  // 为每个操作生成API函数
  for (const op of operations) {
    const { path: apiPath, method, operation } = op;
    
    // 生成函数内容
    const functionContent = generateApiFunctionContent(
      apiPath, 
      method, 
      operation, 
      basePath,
      {
        ...config,
        formatting: {
          quotes,
          semi,
          indent
        }
      }
    );
    
    content += functionContent + '\n\n';
  }
  
  return content.trim();
}

/**
 * 生成自定义文件模板
 * @param {string} sanitizedTag - 清洗后的tag名称（用于文件名）
 * @param {string} tag - 原始tag名称（用于提示信息）
 * @param {string} generatedFileName - 生成的文件名
 * @param {object} config - 配置选项
 * @returns {string} - 自定义文件模板内容
 */
function generateCustomFileTemplate(sanitizedTag, tag, generatedFileName, config = {}) {
  const useSemicolons = config.codeStyle?.useSemicolons !== false;
  const useSingleQuotes = config.codeStyle?.useSingleQuotes !== false;
  const quotes = useSingleQuotes ? "'" : '"';
  const semi = useSemicolons ? ';' : '';
  
  // 如果使用自定义模板
  if (config.advanced?.templates?.customFile) {
    // 这里可以添加自定义模板处理逻辑
  }
  
  // 使用默认模板
  return `/**
 * 该文件用于对 ${tag} 模块的自动生成 API 接口进行自定义扩展，
 * 请勿直接修改 ${generatedFileName} 文件。
 */

// 重新导出所有自动生成的接口
export * from ${quotes}./${generatedFileName.replace(/\.(js|ts)$/, '')}${quotes}${semi}

// 在这里覆盖或扩展需要定制的接口，例如：
// export function someApi(...args) {
//   // 自定义逻辑
//   return require(${quotes}./${generatedFileName.replace(/\.(js|ts)$/, '')}${quotes}).someApi(...args)${semi}
// }
`;
}

/**
 * 生成API函数内容
 * @param {string} apiPath - API路径
 * @param {string} method - HTTP方法
 * @param {object} operation - 操作对象
 * @param {string} basePath - API基础路径
 * @param {object} config - 配置选项
 * @returns {string} - 函数代码
 */
function generateApiFunctionContent(apiPath, method, operation, basePath, config) {
  const { 
    formatting: { quotes, semi, indent },
    comments = {},
    naming = {},
    request = {}
  } = config;
  
  const summary = operation.summary || '';
  const description = operation.description || '';
  const operationId = operation.operationId || '';
  
  // 根据配置生成函数名
  let functionName = getFunctionName(operationId, method, apiPath, naming.apiFunctionNaming);
  
  // 生成参数
  const { paramsList, paramsDoc, urlParams, queryParams, bodyParam } = processParameters(operation.parameters || [], config);
  
  // 生成JSDoc注释
  let jsDoc = '';
  if (comments.generateJSDoc !== false) {
    jsDoc = generateJSDoc(summary, description, paramsDoc, operation.responses, config);
  }
  
  // 生成请求URL
  const urlTemplate = generateUrlTemplate(apiPath, urlParams, config);
  
  // 生成请求选项
  const requestOptions = generateRequestOptions(method, queryParams, bodyParam, config);
  
  // 确保请求选项列表中的每一项末尾都正确处理了分号
  let requestOptionsText = '';
  if (requestOptions.length > 0) {
    // 添加逗号但不添加分号
    requestOptionsText = requestOptions.map(opt => `${indent}${indent}${opt}`).join(',\n');
  }
  
  // 组装函数代码，确保函数结尾正确应用分号配置
  return `${jsDoc}
export function ${functionName}(${paramsList}) {
${indent}const url = \`${urlTemplate}\`${semi}
${indent}return request({
${indent}${indent}url,
${indent}${indent}method: ${quotes}${method.toUpperCase()}${quotes}${requestOptions.length > 0 ? ',' : ''}
${requestOptionsText}
${indent}})${semi}
}${semi}`;
}

/**
 * 根据命名策略获取函数名
 * @param {string} operationId - 操作ID
 * @param {string} method - HTTP方法
 * @param {string} path - API路径
 * @param {string|Function} namingStrategy - 命名策略
 * @returns {string} - 函数名
 */
function getFunctionName(operationId, method, path, namingStrategy = 'camelCase') {
  // 如果有operationId，优先使用
  let name = operationId;
  
  // 如果没有operationId，根据method和path生成
  if (!name) {
    name = `${method}${path.replace(/\//g, '_').replace(/[{}]/g, '')}`;
  }
  
  // 根据命名策略格式化
  if (typeof namingStrategy === 'function') {
    return namingStrategy(operationId, method, path);
  }
  
  switch (namingStrategy) {
    case 'camelCase':
      return toCamelCase(name);
    case 'PascalCase':
      return toPascalCase(name);
    case 'snake_case':
      return toSnakeCase(name);
    case 'kebab-case':
      return toKebabCase(name);
    default:
      return toCamelCase(name);
  }
}

/**
 * 生成JSDoc注释
 * @param {string} summary - 摘要
 * @param {string} description - 描述
 * @param {Array} paramsDoc - 参数文档
 * @param {object} responses - 响应对象
 * @param {object} config - 配置选项
 * @returns {string} - JSDoc注释
 */
function generateJSDoc(summary, description, paramsDoc, responses, config) {
  const { comments = {} } = config;
  let jsDoc = '/**\n';
  
  // 添加摘要
  if (summary) {
    jsDoc += ` * ${summary}\n`;
  }
  
  // 添加描述
  if (description && description !== summary) {
    jsDoc += ` * ${description}\n`;
  }
  
  // 添加参数文档
  if (paramsDoc.length > 0 && comments.includeParamDescriptions !== false) {
    jsDoc += paramsDoc.map(p => ` * @param {${p.type}} ${p.name}${p.description ? ` - ${p.description}` : ''}`).join('\n') + '\n';
  }
  
  // 添加返回值文档
  if (responses && comments.includeResponseType !== false) {
    const successResponse = responses['200'] || responses['201'] || responses['default'];
    if (successResponse && successResponse.schema) {
      const responseType = getResponseType(successResponse.schema);
      jsDoc += ` * @returns {${responseType}} ${successResponse.description || 'Success response'}\n`;
    }
  }
  
  jsDoc += ' */';
  return jsDoc;
}

/**
 * 处理API参数
 * @param {Array} parameters - 参数列表
 * @param {object} config - 配置选项
 * @returns {object} - 处理后的参数信息
 */
function processParameters(parameters, config) {
  const { naming = {} } = config;
  const namingStrategy = naming.parameterNaming || 'camelCase';
  
  // 处理各类参数
  const urlParams = parameters.filter(p => p.in === 'path');
  const queryParams = parameters.filter(p => p.in === 'query');
  const bodyParams = parameters.filter(p => p.in === 'body');
  const formParams = parameters.filter(p => p.in === 'formData');
  
  // 组合成函数参数列表
  const funcParams = [];
  let bodyParam = null;
  
  // 添加URL参数
  urlParams.forEach(p => {
    const paramName = formatParamName(p.name, namingStrategy);
    funcParams.push(paramName);
  });
  
  // 添加查询参数（如有）
  if (queryParams.length > 0) {
    funcParams.push('params');
  }
  
  // 添加请求体参数（如有）
  if (bodyParams.length > 0 || formParams.length > 0) {
    funcParams.push('data');
    
    if (bodyParams.length > 0) {
      bodyParam = bodyParams[0];
    }
  }
  
  // 生成函数参数列表字符串
  const paramsList = funcParams.join(', ');
  
  // 生成参数文档
  const paramsDoc = [];
  
  // 添加URL参数文档
  urlParams.forEach(p => {
    const paramName = formatParamName(p.name, namingStrategy);
    paramsDoc.push({
      name: paramName,
      type: getJSDocType(p),
      description: p.description || `路径参数: ${p.name}`
    });
  });
  
  // 添加查询参数文档
  if (queryParams.length > 0) {
    paramsDoc.push({
      name: 'params',
      type: 'object',
      description: '查询参数'
    });
    
    queryParams.forEach(p => {
      paramsDoc.push({
        name: `params.${formatParamName(p.name, namingStrategy)}`,
        type: getJSDocType(p),
        description: p.description || ''
      });
    });
  }
  
  // 添加请求体参数文档
  if (bodyParams.length > 0) {
    const bodyParam = bodyParams[0];
    paramsDoc.push({
      name: 'data',
      type: getJSDocType(bodyParam),
      description: bodyParam.description || '请求体数据'
    });
    
    // 如果body参数有schema且是引用类型，添加额外的类型信息
    if (bodyParam.schema && bodyParam.schema.$ref) {
      const refType = bodyParam.schema.$ref.split('/').pop();
      paramsDoc[paramsDoc.length - 1].type = refType;
    }
  } else if (formParams.length > 0) {
    paramsDoc.push({
      name: 'data',
      type: 'object',
      description: '表单数据'
    });
    
    formParams.forEach(p => {
      paramsDoc.push({
        name: `data.${formatParamName(p.name, namingStrategy)}`,
        type: getJSDocType(p),
        description: p.description || ''
      });
    });
  }
  
  return {
    paramsList,
    paramsDoc,
    urlParams,
    queryParams,
    bodyParam
  };
}

/**
 * 根据命名策略格式化参数名
 * @param {string} name - 原始参数名
 * @param {string} strategy - 命名策略
 * @returns {string} - 格式化后的参数名
 */
function formatParamName(name, strategy) {
  switch (strategy) {
    case 'camelCase':
      return toCamelCase(name);
    case 'PascalCase':
      return toPascalCase(name);
    case 'snake_case':
      return toSnakeCase(name);
    case 'kebab-case':
      return toKebabCase(name);
    default:
      return name;
  }
}

/**
 * 获取参数的JSDoc类型
 * @param {object} param - 参数对象
 * @returns {string} - JSDoc类型字符串
 */
function getJSDocType(param) {
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
          return `Array<${itemType}>`;
        }
        return `Array<${getJSDocType(param.items)}>`;
      }
      return 'Array<any>';
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
 * @param {Array} urlParams - URL参数
 * @param {object} config - 配置选项
 * @returns {string} - URL模板
 */
function generateUrlTemplate(apiPath, urlParams, config) {
  const { naming = {} } = config;
  const namingStrategy = naming.parameterNaming || 'camelCase';
  
  // 开始处理URL路径，替换路径参数占位符
  let urlTemplate = `\${path}${apiPath}`;
  
  // 替换URL参数
  urlParams.forEach(param => {
    const paramName = formatParamName(param.name, namingStrategy);
    // 将 {paramName} 替换为 ${paramName}
    urlTemplate = urlTemplate.replace(`{${param.name}}`, `\${${paramName}}`);
  });
  
  return urlTemplate;
}

/**
 * 生成请求选项
 * @param {string} method - HTTP方法
 * @param {Array} queryParams - 查询参数
 * @param {object} bodyParam - 请求体参数
 * @param {object} config - 配置选项
 * @returns {Array} - 请求选项字符串数组
 */
function generateRequestOptions(method, queryParams, bodyParam, config) {
  const { request = {}, formatting = {} } = config;
  const { quotes = "'" } = formatting;
  
  const options = [];
  
  // 添加查询参数
  if (queryParams && queryParams.length > 0) {
    options.push('params');
  }
  
  // 添加请求体参数
  if (bodyParam || (method === 'post' || method === 'put' || method === 'patch')) {
    options.push('data');
  }
  
  // 添加默认请求选项
  if (request.defaultRequestOptions) {
    const defaultOptions = request.defaultRequestOptions;
    
    // 遍历默认选项
    Object.entries(defaultOptions).forEach(([key, value]) => {
      if (typeof value === 'object') {
        // 对于对象类型选项，使用JSON.stringify
        options.push(`${key}: ${JSON.stringify(value)}`);
      } else if (typeof value === 'string') {
        // 对于字符串类型，添加引号
        options.push(`${key}: ${quotes}${value}${quotes}`);
      } else {
        // 对于其他类型，直接使用值
        options.push(`${key}: ${value}`);
      }
    });
  }
  
  return options;
}

// 辅助函数：命名格式转换
function toCamelCase(str) {
  return str.replace(/[-_]([a-z])/g, (g) => g[1].toUpperCase());
}

function toPascalCase(str) {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, (g) => `_${g[0].toLowerCase()}`);
}

function toKebabCase(str) {
  return str.replace(/([A-Z])/g, (g) => `-${g[0].toLowerCase()}`);
}

// 清理API标签名称，用于文件名
function sanitizeTagName(tag) {
  return tag.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * 获取响应类型
 * @param {object} schema - 响应schema对象
 * @returns {string} - 响应类型字符串
 */
function getResponseType(schema) {
  if (!schema) return 'any';
  
  if (schema.$ref) {
    // 引用类型，返回引用名称
    return schema.$ref.split('/').pop();
  }
  
  if (schema.type === 'array') {
    if (schema.items) {
      if (schema.items.$ref) {
        const itemType = schema.items.$ref.split('/').pop();
        return `Array<${itemType}>`;
      }
      return `Array<${getJSDocType(schema.items)}>`;
    }
    return 'Array<any>';
  }
  
  // 使用基本类型映射
  return getJSDocType(schema);
}

// 导出函数
module.exports = {
  generateAxiosFiles
};
