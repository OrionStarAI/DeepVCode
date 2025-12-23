/**
 * Message Input Component - 重构后的主组件
 * 基于 Lexical 的富文本输入组件，支持文件拖拽、富文本显示等功能
 */

import React, { useState, useRef, useEffect, useImperativeHandle } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $getRoot, $getSelection, EditorState } from 'lexical';
import { $isRangeSelection } from 'lexical';
import { $createTextNode, $createParagraphNode, $createLineBreakNode } from 'lexical';
import { Send, Square, Check } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { MessageContent } from '../types/index';
import { ModelSelector } from './ModelSelector';


// 导入拆分后的组件和节点
import { FileReferenceNode, $createFileReferenceNode, $isFileReferenceNode } from './MessageInput/nodes/FileReferenceNode';
import { ImageReferenceNode, $createImageReferenceNode, $isImageReferenceNode } from './MessageInput/nodes/ImageReferenceNode';
import { CodeReferenceNode, $createCodeReferenceNode, $isCodeReferenceNode } from './MessageInput/nodes/CodeReferenceNode';
import { TerminalReferenceNode, $isTerminalReferenceNode } from './MessageInput/nodes/TerminalReferenceNode';
import { KeyboardPlugin } from './MessageInput/plugins/KeyboardPlugin';
import { DragDropPlugin } from './MessageInput/plugins/DragDropPlugin';
import { ClipboardPlugin } from './MessageInput/plugins/ClipboardPlugin';
import { FileAutocompletePlugin } from './MessageInput/plugins/FileAutocompletePlugin';
import { SlashCommandPlugin } from './MessageInput/plugins/SlashCommandPlugin';
import { EditorRefPlugin } from './MessageInput/plugins/EditorRefPlugin';
import { slashCommandHandler } from '../services/slashCommandHandler';
import { UnifiedFileUploadButton } from './MessageInput/components/UnifiedFileUploadButton';
import { RefineButton } from './MessageInput/components/RefineButton';
import { ImageReference, resetImageCounter } from './MessageInput/utils/imageProcessor';
import { FileUploadResult, FileType } from './MessageInput/utils/fileTypes';
import { PlanModeToggle } from './PlanModeToggle';
import { useRefineCommand } from '../hooks/useRefineCommand';
import { atSymbolHandler } from '../services/atSymbolHandler';
import { DISALLOWED_BINARY_EXTENSIONS } from './MessageInput/utils/fileTypes';

import './MessageInput/MessageInput.css';

interface MessageInputProps {
  isLoading: boolean;
  isProcessing?: boolean;
  canAbort?: boolean;
  onSendMessage: (content: MessageContent) => void;
  onAbortProcess?: () => void;
  onMessageSent?: () => void; // 🎯 新增：消息发送后的回调
  selectedModelId?: string; // 🎯 新增：当前选中的模型ID
  onModelChange?: (modelId: string) => void; // 🎯 新增：模型变更回调
  sessionId?: string; // 🎯 新增：当前会话ID
  tokenUsage?: { // 🎯 新增：Token使用情况
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokenLimit: number;
    cachedContentTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    creditsUsage?: number;
  };

  // 🎯 新增：编辑模式支持
  mode?: 'compose' | 'edit';                    // 模式：撰写新消息 | 编辑现有消息
  editingMessageId?: string;                    // 编辑的消息ID
  initialContent?: MessageContent;              // 初始内容（编辑模式使用）
  onSaveEdit?: (messageId: string, content: MessageContent) => void;  // 保存编辑
  onCancelEdit?: () => void;                   // 取消编辑

  // 🎯 新增：样式和行为定制
  className?: string;                          // 自定义样式类
  showModelSelector?: boolean;                 // 是否显示模型选择器
  showTokenUsage?: boolean;                    // 是否显示Token使用情况
  placeholder?: string;                        // 自定义占位符
  compact?: boolean;                          // 紧凑模式（编辑时可能需要）

  // 🎯 新增：Plan模式
  isPlanMode?: boolean;                        // 是否在Plan模式
  onTogglePlanMode?: (enabled: boolean) => void;  // Plan模式切换回调
  // 🎯 新增：模型切换状态
  isModelSwitching?: boolean;
}

// Lexical 错误边界组件
function LexicalErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// 🎯 定义 MessageInput 暴露的方法接口
export interface MessageInputHandle {
  insertCodeReference: (codeRef: {
    fileName: string;
    filePath: string;
    code: string;
    startLine?: number;
    endLine?: number;
  }) => void;
  setContent: (content: MessageContent) => void; // 🎯 新增：设置内容方法
}

export const MessageInput = React.forwardRef<MessageInputHandle, MessageInputProps>((props, ref) => {
  const {
    isLoading,
    isProcessing = false,
    canAbort = false,
    onSendMessage,
    onAbortProcess,
    onMessageSent,
    selectedModelId,
    onModelChange,
    sessionId,
    tokenUsage,

    // 🎯 编辑模式属性
    mode = 'compose',
    editingMessageId,
    initialContent,
    onSaveEdit,
    onCancelEdit,
    isModelSwitching = false, // 🎯 接收模型切换状态

    // 🎯 样式和行为定制
    className = '',
    showModelSelector = true,
    showTokenUsage = true,
    placeholder,
    compact = false,

    // 🎯 Plan模式
    isPlanMode = false,
    onTogglePlanMode
  } = props;
  const { t } = useTranslation();

  // 🎯 从 useRefineCommand hook 获取 refine 功能
  const {
    refineResult,
    isLoading: isRefineLoading,
    executeRefine,
    clearRefineResult
  } = useRefineCommand();

  // 🎯 编辑模式标志
  const isEditMode = mode === 'edit';

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [textContent, setTextContent] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [hasPopulatedContent, setHasPopulatedContent] = useState(false); // 🎯 标记初始内容是否已填充
  // 🎯 FIX：重新引入 containerHeight，但默认为 undefined (即 auto)
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);
  const [isAutoExpanded, setIsAutoExpanded] = useState(false); // 状态标记，用于样式控制
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(0);

  // 🎯 自定义代理服务器URL状态
  const [customProxyServerUrl, setCustomProxyServerUrl] = useState<string | undefined>(undefined);

  // 🎯 从extension获取customProxyServerUrl配置
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'config_update' && event.data?.payload) {
        const proxyUrl = event.data.payload.customProxyServerUrl;
        // 设置里有值就显示，没有或空就不显示
        setCustomProxyServerUrl(proxyUrl || undefined);
      }
    };

    window.addEventListener('message', handleMessage);

    // 组件挂载时向extension请求当前配置
    const vsCodeApi = (window as any).vscode;
    if (vsCodeApi?.postMessage) {
      vsCodeApi.postMessage({
        type: 'request_config',
        payload: {}
      });
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // 🎯 自动扩展配置
  const MIN_HEIGHT = 140;
  const MAX_HEIGHT = 400; // 自动模式下的上限

  // 🎯 Lexical 初始化配置
  const initialConfig = {
    namespace: 'MessageInput',
    nodes: [FileReferenceNode, ImageReferenceNode, CodeReferenceNode, TerminalReferenceNode], // 注册自定义节点
    onError: (error: Error) => {
      console.error('Lexical Error:', error);
    },
    theme: {
      root: 'lexical-root',
      text: {
        bold: 'lexical-text-bold',
        italic: 'lexical-text-italic',
        underline: 'lexical-text-underline',
      }
    }
  };

  // 🎯 计算剩余上下文百分比
  const getContextLeftPercentage = (): number | null => {
    if (!tokenUsage || !tokenUsage.tokenLimit || tokenUsage.tokenLimit <= 0) {
      return null;
    }

    const usedPercentage = (tokenUsage.totalTokens / tokenUsage.tokenLimit) * 100;
    const leftPercentage = Math.max(0, 100 - usedPercentage);
    return Math.round(leftPercentage);
  };

  // 🎯 处理编辑器状态变化
  const handleChange = (editorState: EditorState) => {
    setEditorState(editorState);

    let contentChanged = false;
    let newTextContent = '';

    editorState.read(() => {
      const root = $getRoot();
      newTextContent = root.getTextContent();
      // 🎯 只有当内容真正发生变化时才触发自动扩展
      contentChanged = newTextContent !== textContent;
    });

    setTextContent(newTextContent);

    // 🎯 FIX #4: 当用户输入内容时重新启用自动扩展
    if (newTextContent.trim().length > 0 && !isAutoExpanded) {
      setIsAutoExpanded(true);
    }
  };

  // 🎯 监听文本内容变化，更新自动扩展状态
  useEffect(() => {
    // 🎯 FIX：简化为仅管理状态，CSS处理真实高度
    const hasContent = textContent.trim().length > 0;
    if (hasContent && !isAutoExpanded) {
      setIsAutoExpanded(true);
    } else if (!hasContent && isAutoExpanded) {
      setIsAutoExpanded(false);
    }
  }, [textContent, isAutoExpanded]);

  // 🎯 FIX：编辑模式现在由CSS完全处理高度
  const checkAndAutoExpandForEdit = () => {
    if (isResizing) return;
    // CSS会自动处理编辑模式的高度，这里只需管理状态
    const hasContent = textContent.trim().length > 0;
    if (hasContent && !isAutoExpanded) {
      setIsAutoExpanded(true);
    } else if (!hasContent && isAutoExpanded) {
      setIsAutoExpanded(false);
    }
  };



  // 🎯 检查并自动扩展容器高度（撰写模式）
  // 🎯 FIX：简化逻辑 - CSS已经处理了自动扩展，这里只需要简单的状态管理
  const checkAndAutoExpand = () => {
    if (isResizing) return;

    const hasContent = textContent.trim().length > 0;

    // 🎯 FIX：不再手动计算高度，CSS flex会自动处理
    // 只管理状态标志
    if (hasContent && !isAutoExpanded) {
      setIsAutoExpanded(true);
    } else if (!hasContent && isAutoExpanded) {
      setIsAutoExpanded(false);
    }
  };

  // 🎯 插入文件引用节点到编辑器
  const insertFileReferenceNode = (fullPath: string) => {
    const fileName = fullPath.split(/[/\\]/).pop() || fullPath;
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    // 🎯 检查是否为不支持的二进制文件
    if (DISALLOWED_BINARY_EXTENSIONS.includes(extension)) {
      console.warn(`🚫 [MessageInput] 拦截到不支持的二进制文件: ${fileName}`);
      if (window.vscode) {
        window.vscode.postMessage({
          type: 'show_notification',
          payload: {
            message: `暂不支持读取二进制文件 "${fileName}"，建议仅添加文本或代码文件。`,
            type: 'warning'
          }
        });
      }
      return;
    }

    if (editorRef.current) {
      editorRef.current.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const fileReferenceNode = $createFileReferenceNode(fileName, fullPath);
          selection.insertNodes([fileReferenceNode]);
          // 在文件引用后添加一个空格
          selection.insertText(' ');
        }
      });
    }
  };

  // 🎯 处理文件拖拽 - 增强的路径解析逻辑
  const handleFilesDrop = (filePaths: string[]) => {
    console.log('🎯 MessageInput received files:', filePaths);

    const processedFiles: string[] = [];
    const needResolution: string[] = [];

    // 🎯 改进的路径分类逻辑
    for (const filePath of filePaths) {
      // Windows: C:\ 或 \\  | Unix: /
      const isAbsolutePath =
        filePath.match(/^[A-Za-z]:[\\/]/) ||  // Windows 绝对路径: C:\, D:/
        filePath.startsWith('\\\\') ||        // UNC 路径: \\server\share
        filePath.startsWith('/');             // Unix 绝对路径: /path

      if (isAbsolutePath) {
        processedFiles.push(filePath);
      } else {
        needResolution.push(filePath);
      }
    }

    console.log('🎯 路径分类结果:', { processedFiles, needResolution });

    // 立即处理绝对路径文件
    if (processedFiles.length > 0) {
      processedFiles.forEach(insertFileReferenceNode);
    }

    // 🎯 对于需要解析的相对路径，通过VSCode API请求解析
    if (needResolution.length > 0) {
      console.log('🎯 Files need path resolution:', needResolution);

      if (window.vscode) {
        // 🎯 使用 flag 防止重复处理
        let isResolved = false;

        window.vscode.postMessage({
          type: 'resolve_file_paths',
          payload: { files: needResolution }
        });

        // 🎯 改进的消息监听器
        const handlePathResolution = (event: MessageEvent) => {
          const message = event.data;
          if (message.type === 'file_paths_resolved' && !isResolved) {
            isResolved = true;
            window.removeEventListener('message', handlePathResolution);
            const resolvedFiles: string[] = message.payload.resolvedFiles || [];
            console.log('🎯 Resolved file paths:', resolvedFiles);

            if (resolvedFiles.length > 0) {
              resolvedFiles.forEach(insertFileReferenceNode);
            }
          }
        };

        window.addEventListener('message', handlePathResolution);

        // 设置超时，避免无限等待
        setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            window.removeEventListener('message', handlePathResolution);
            console.warn('🎯 File path resolution timeout, using original paths');
            // 超时后使用原始路径作为后备
            needResolution.forEach(insertFileReferenceNode);
          }
        }, 2000); // 减少到2秒超时
      } else {
        // 没有VSCode API的情况下，直接使用原始路径
        needResolution.forEach(insertFileReferenceNode);
      }
    }
  };

  // 🎯 处理 @ 自动完成选择的文件
  const handleFileAutoComplete = (fileName: string, filePath: string) => {
    insertFileReferenceNode(filePath);
  };

  // 🎯 插入图片引用节点
  const insertImageReferenceNode = (imageData: ImageReference) => {
    if (editorRef.current) {
      editorRef.current.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const imageReferenceNode = $createImageReferenceNode(imageData);
          selection.insertNodes([imageReferenceNode]);

          // 在图片节点后添加空格
          const spaceNode = $createTextNode(' ');
          imageReferenceNode.insertAfter(spaceNode);
        }
      });
    }
  };

  // 🎯 处理统一的文件上传（图片、代码、Markdown）
  const handleFileSelected = (result: FileUploadResult) => {
    if (!editorRef.current) {
      console.error('编辑器引用不可用');
      return;
    }

    if (result.type === FileType.IMAGE && result.imageData) {
      // 处理图片文件
      const imageRef: ImageReference = {
        id: result.id,
        fileName: result.fileName,
        data: result.imageData.data,
        mimeType: result.imageData.mimeType,
        originalSize: result.imageData.originalSize,
        compressedSize: result.imageData.compressedSize,
        width: result.imageData.width,
        height: result.imageData.height,
      };
      insertImageReferenceNode(imageRef);
    } else if (result.type === FileType.TEXT && result.textData) {
      // 处理文本文件（代码 + Markdown）
      const textData = result.textData;
      editorRef.current.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          // 插入文件引用节点
          const fileReferenceNode = $createFileReferenceNode(
            result.fileName,
            result.fileName // 对于文本文件，使用文件名作为路径的标识
          );

          // ✨ 新增：保存完整的文件内容和语言到节点中
          fileReferenceNode.setFileContent(textData.content, textData.language);

          console.log(`🔍 [DEBUG] 设置文件内容: ${result.fileName}, contentLength: ${textData.content.length}, language: ${textData.language}`);
          console.log(`🔍 [DEBUG] 节点内容验证: ${fileReferenceNode.__fileContent?.length || 0} chars`);

          selection.insertNodes([fileReferenceNode]);

          // 在文件引用后添加空格
          const spaceNode = $createTextNode(' ');
          fileReferenceNode.insertAfter(spaceNode);

          console.log(`✅ 文本文件已插入: ${result.fileName}${textData.language ? ` (${textData.language})` : ''}`);
        }
      });
    }
  };

  // 🎯 在上传前聚焦编辑器
  const handleBeforeUpload = () => {
    if (editorRef.current) {
      console.log('🖼️ 准备上传图片：聚焦编辑器');
      editorRef.current.focus();

      // 确保光标在末尾
      editorRef.current.update(() => {
        const root = $getRoot();
        root.selectEnd();
      });
    }
  };

  // 🎯 填充编辑器内容（编辑模式使用）- 支持新的原始结构
  const populateEditorWithContent = (content: MessageContent) => {
    if (!editorRef.current || !content) {
      console.log('🎯 无法填充内容，编辑器或内容为空');
      return;
    }

    console.log('🎯 开始填充编辑器内容（原始结构）:', content);

    editorRef.current.update(() => {
      const root = $getRoot();
      root.clear();

      // 🎯 处理新的原始结构化内容
      if (Array.isArray(content)) {
        // 创建一个段落来包含所有内容
        const paragraph = $createParagraphNode();

        // 按原始顺序恢复内容
        content.forEach((item, index) => {
          console.log(`🎯 恢复内容项 ${index}:`, item);

          try {
            if (item.type === 'text') {
              // 🎯 处理文本内容
              if (item.value) {
                paragraph.append($createTextNode(item.value));
                console.log('🎯 恢复文本节点:', item.value);
              }
            } else if (item.type === 'file_reference') {
              // 🎯 处理文件引用
              if (item.value?.fileName && item.value?.filePath) {
                const fileNode = $createFileReferenceNode(item.value.fileName, item.value.filePath);
                paragraph.append(fileNode);
                console.log('🎯 恢复文件引用节点:', item.value.fileName);
              }
            } else if (item.type === 'image_reference') {
              // 🎯 处理图片引用
              if (item.value) {
                // 确保图片数据包含所有必需字段
                const imageData = {
                  ...item.value,
                  id: item.value.id || `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                };
                const imageNode = $createImageReferenceNode(imageData);
                paragraph.append(imageNode);
                console.log('🎯 恢复图片引用节点:', item.value.fileName);
              }
            } else if (item.type === 'code_reference') {
              // 🎯 处理代码引用
              if (item.value?.fileName && item.value?.filePath && item.value?.code) {
                const codeNode = $createCodeReferenceNode(
                  item.value.fileName,
                  item.value.filePath,
                  item.value.startLine,
                  item.value.endLine,
                  item.value.code
                );
                paragraph.append(codeNode);
                console.log('🎯 恢复代码引用节点:', item.value.fileName, `(${item.value.startLine}-${item.value.endLine})`);
              }
            }
          } catch (error) {
            console.error('🎯 恢复内容项时出错:', item, error);
          }
        });

        root.append(paragraph);
      } else {
        // 🎯 如果内容不是数组格式，可能是旧格式的字符串
        console.log('🎯 内容不是数组格式，尝试作为文本处理');
        const textContent = typeof content === 'string' ? content : JSON.stringify(content);
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(textContent));
        root.append(paragraph);
      }

      console.log('🎯 编辑器内容填充完成');
    });

    // 🎯 更新文本内容状态并检查高度调整
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.getEditorState().read(() => {
          const root = $getRoot();
          const newTextContent = root.getTextContent();
          setTextContent(newTextContent);
        });

        // 🎯 编辑模式下，根据内容长度立即调整高度
        if (isEditMode) {
          setTimeout(() => {
            checkAndAutoExpandForEdit();
          }, 100);
        }
      }
    }, 300);
  };

  // 🎯 编辑器准备就绪回调
  const handleEditorReady = () => {
    if (isEditMode && initialContent && !hasPopulatedContent) {
      console.log('🎯 编辑器准备就绪，填充初始内容:', initialContent);
      populateEditorWithContent(initialContent);
      setHasPopulatedContent(true);
      console.log('🎯 初始内容填充完成');
      // 自动聚焦到编辑器，并将光标移到末尾
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          // 使用更健壮的光标定位方式
          setTimeout(() => {
            if (editorRef.current) {
              editorRef.current.update(() => {
                const root = $getRoot();
                root.selectEnd();
              });

              // 🎯 检查并调整编辑器高度
              setTimeout(() => {
                checkAndAutoExpandForEdit();
              }, 50);
            }
          }, 50);
        }
      }, 100);
    }
  };

  // 🎯 编辑模式下预填充初始内容 (备用方案)
  useEffect(() => {
    if (isEditMode && initialContent && editorRef.current && !hasPopulatedContent) {
      console.log('🎯 useEffect尝试填充初始内容:', initialContent);
      // 确保编辑器完全初始化后再填充内容
      setTimeout(() => {
        if (editorRef.current && !hasPopulatedContent) {
          populateEditorWithContent(initialContent);
          setHasPopulatedContent(true);
          console.log('🎯 useEffect初始内容填充完成');
          // 自动聚焦到编辑器，并将光标移到末尾
          setTimeout(() => {
            if (editorRef.current) {
              editorRef.current.focus();
              // 使用更健壮的光标定位方式
              setTimeout(() => {
                if (editorRef.current) {
                  editorRef.current.update(() => {
                    const root = $getRoot();
                    root.selectEnd();
                  });

                  // 🎯 检查并调整编辑器高度
                  setTimeout(() => {
                    checkAndAutoExpandForEdit();
                  }, 50);
                }
              }, 50);
            }
          }, 50);
        }
      }, 200); // 增加延迟确保编辑器完全就绪
    }
  }, [isEditMode, initialContent, hasPopulatedContent]);

  // 🎯 监听并处理 refine 结果
  useEffect(() => {
    console.log('[MessageInput] refineResult changed:', refineResult);

    if (refineResult && refineResult.refined && !refineResult.error) {
      console.log('[MessageInput] Updating editor with refined text:', refineResult.refined);

      // 用优化后的文本替换编辑器中的内容
      if (editorRef.current) {
        editorRef.current.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(refineResult.refined));
          root.append(paragraph);
        });

        // 更新文本状态
        setTextContent(refineResult.refined);

        // 触发自动扩展
        setTimeout(() => {
          checkAndAutoExpand();
        }, 50);

        // 清除 refine 结果
        clearRefineResult();
        console.log('[MessageInput] Refine result cleared');
      }
    } else if (refineResult && refineResult.error) {
      console.log('[MessageInput] Refine error:', refineResult.error);
    }
  }, [refineResult, clearRefineResult]);

  // 🎯 处理剪切板图片粘贴
  const handleImagePaste = (imageData: ImageReference) => {
    insertImageReferenceNode(imageData);
  };

  const handleSend = async () => {
    // 🎯 从当前编辑器状态提取原始结构，保持编辑器节点的原始顺序
    if (!editorRef.current) return;

    const rawContent: any[] = [];

    editorRef.current.getEditorState().read(() => {
      const root = $getRoot();

      // 🎯 新逻辑：按节点顺序收集原始结构，避免重复内容
      const collectRawStructure = (node: any) => {
        if ($isFileReferenceNode(node)) {
          // 文件引用节点 - 直接处理，不递归子节点
          // ✨ 新增：检查是否有嵌入的文件内容
          console.log(`🔍 [DEBUG] FileReferenceNode: ${node.__fileName}, hasContent: ${!!node.__fileContent}, contentLength: ${node.__fileContent?.length || 0}`);

          if (node.__fileContent) {
            // 有完整内容（来自文本文件上传）
            console.log(`✅ [DEBUG] 使用 text_file_content 类型: ${node.__fileName}`);
            rawContent.push({
              type: 'text_file_content',
              value: {
                fileName: node.__fileName,
                content: node.__fileContent,
                language: node.__language,
                size: node.__fileContent.length
              }
            });
          } else {
            // 无内容（来自项目文件引用）
            console.log(`⚠️ [DEBUG] 使用 file_reference 类型: ${node.__fileName}`);
            rawContent.push({
              type: 'file_reference',
              value: {
                fileName: node.__fileName,
                filePath: node.__filePath
              }
            });
          }
        } else if ($isImageReferenceNode(node)) {
          // 图片引用节点 - 直接处理，不递归子节点
          rawContent.push({
            type: 'image_reference',
            value: node.__imageData
          });
        } else if ($isCodeReferenceNode(node)) {
          // 🎯 代码引用节点 - 发送完整代码内容给 AI
          rawContent.push({
            type: 'code_reference',
            value: {
              fileName: node.__fileName,
              filePath: node.__filePath,
              startLine: node.__startLine,
              endLine: node.__endLine,
              code: node.__code  // 发送完整代码给 AI
            }
          });
        } else if ($isTerminalReferenceNode(node)) {
          // 🎯 终端引用节点 - 先收集信息，稍后异步获取输出
          rawContent.push({
            type: 'terminal_reference',
            value: {
              terminalId: node.getTerminalId(),
              terminalName: node.getTerminalName(),
              output: '', // 🎯 占位符，稍后填充
              _needsFetch: true // 🎯 标记需要获取输出
            }
          });
        } else {
          // 对于其他节点，检查是否有子节点
          const children = node.getChildren?.() || [];

          if (children.length > 0) {
            // 有子节点，递归处理子节点（不处理当前节点的文本）
            children.forEach(collectRawStructure);
          } else {
            // 叶子节点，获取其文本内容
            const textContent = node.getTextContent();
            if (textContent) {
              rawContent.push({
                type: 'text',
                value: textContent
              });
            }
          }
        }
      };

      // 遍历所有根节点，保持原始顺序
      root.getChildren().forEach(collectRawStructure);
    });

    // 🎯 检查是否有内容并且不在加载/处理状态
    const hasContent = rawContent.some(part =>
      (part.type === 'text' && part.value.trim()) ||
      part.type === 'file_reference' ||
      part.type === 'image_reference' ||
      part.type === 'code_reference' ||  // 🎯 支持代码引用
      part.type === 'text_file_content' ||  // ✨ 包含文本文件内容
      part.type === 'terminal_reference'  // 🎯 支持终端引用
    );

    if (hasContent) {
      // 🎯 根据模式调用不同的处理函数
      if (isEditMode && editingMessageId && onSaveEdit) {
        // 编辑模式：保存编辑，直接传递原始结构
        onSaveEdit(editingMessageId, rawContent);
      } else {
        // 🎯 检测自定义斜杠命令并转换为 prompt
        let finalContent = rawContent;

        // 检查是否是纯文本且以斜杠命令开头
        const textParts = rawContent.filter(p => p.type === 'text');
        if (textParts.length === 1 && rawContent.length === 1) {
          const text = textParts[0].value.trim();
          const slashMatch = text.match(/^\/([^\s]+)(?:\s+(.*))?$/);

          if (slashMatch) {
            const commandName = slashMatch[1];
            const args = slashMatch[2] || '';

            // 尝试执行自定义斜杠命令
            const result = await slashCommandHandler.executeCommand(commandName, args);

            if (result.success && result.prompt) {
              // 命令执行成功，用处理后的 prompt 替换原始内容
              finalContent = [{ type: 'text', value: result.prompt }];
              console.log(`🎯 [SlashCommand] Executed /${commandName}, prompt length: ${result.prompt.length}`);
            } else if (result.error) {
              // 命令执行失败，但不阻止发送（可能是内置命令或无效命令）
              console.log(`⚠️ [SlashCommand] /${commandName} not a custom command: ${result.error}`);
              // 继续使用原始内容发送
            }
          }
        }

        // 🎯 异步获取所有终端引用的输出内容
        const terminalRefs = finalContent.filter(
          (p: any) => p.type === 'terminal_reference' && p.value._needsFetch
        );

        if (terminalRefs.length > 0) {
          console.log(`🖥️ [Terminal] Fetching output for ${terminalRefs.length} terminal(s)...`);

          // 并行获取所有终端输出
          const terminalPromises = terminalRefs.map(async (ref: any) => {
            try {
              const result = await atSymbolHandler.getTerminalOutput(ref.value.terminalId);
              if (result) {
                ref.value.output = result.output;
                ref.value.terminalName = result.name; // 更新终端名称
                console.log(`✅ [Terminal] Got output for ${result.name}, length: ${result.output.length}`);
              }
            } catch (error) {
              console.error(`❌ [Terminal] Failed to get output for terminal ${ref.value.terminalId}:`, error);
              ref.value.output = `[获取终端输出失败: ${error}]`;
            }
            // 清理临时标记
            delete ref.value._needsFetch;
          });

          await Promise.all(terminalPromises);
        }

        // 撰写模式：发送消息
        onSendMessage(finalContent);

        // 🎯 触发滚动到底部
        if (onMessageSent) {
          onMessageSent();
        }
      }

      // 清空编辑器内容
      clearEditor();
    }
  };

  // 🎯 清空编辑器的统一方法
  const clearEditor = () => {
    if (editorRef.current) {
      editorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
      });
    }
    setTextContent('');
    resetImageCounter();
    setHasPopulatedContent(false); // 🎯 重置填充状态

    // 🎯 FIX：发送后重置为自动高度
    setContainerHeight(undefined);
    setIsAutoExpanded(false);
  };

  // 🎯 处理取消编辑
  const handleCancel = () => {
    if (isEditMode && onCancelEdit) {
      onCancelEdit();
    }
    clearEditor();
  };

  // 🎯 FIX：恢复手动拖拽调整大小逻辑
  const handleResizeStart = (e: React.MouseEvent) => {
    console.log('[RESIZE] Start dragging');
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;

    // 获取当前实际高度
    const currentHeight = containerRef.current?.offsetHeight || MIN_HEIGHT;
    resizeStartHeight.current = currentHeight;
    console.log('[RESIZE] Initial height:', currentHeight);

    const handleMouseMove = (e: MouseEvent) => {
      // 向上拖拽增加高度
      const deltaY = resizeStartY.current - e.clientY;
      // 🎯 限制最高为视口高度的 70%
      const maxHeightLimit = window.innerHeight * 0.7;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeightLimit, resizeStartHeight.current + deltaY));

      // 🎯 实时更新高度
      setContainerHeight(newHeight);
    };

    const handleMouseUp = () => {
      console.log('[RESIZE] Stop dragging');
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const insertQuickPrompt = (prompt: string) => {
    if (editorRef.current) {
      editorRef.current.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(prompt);
        }
      });
      editorRef.current.focus();
    }
  };

  // 🎯 监听编辑器内容变化和窗口大小变化
  React.useEffect(() => {
    const handleResize = () => {
      // 窗口大小变化时重新检查是否需要调整高度
      setTimeout(checkAndAutoExpand, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🎯 清空编辑器时重置高度
  const handleClear = () => {
    if (editorRef.current) {
      editorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
      });
    }
    setTextContent('');
    // 🎯 FIX：清空后重置为自动高度
    setContainerHeight(undefined);
    setIsAutoExpanded(false);
  };

  // 🎯 构建容器样式类
  const containerClasses = [
    'message-input-container',
    isResizing ? 'resizing' : '',
    isEditMode ? 'edit-mode' : 'compose-mode',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      style={{
        height: containerHeight ? `${containerHeight}px` : 'auto',
        // 🎯 始终限制最高不超过视口高度的 70%
        maxHeight: containerHeight ? '70vh' : `${MAX_HEIGHT}px`
      }}
    >
      {/* 拖拽调整大小手柄 */}
      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        title="拖拽调整编辑器高度"
      />
      <div className="input-wrapper">
        <LexicalComposer initialConfig={initialConfig}>
          <div className="lexical-editor-container">
            <div className="rich-text-wrapper">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className={`message-input lexical-content-editable`}
                    spellCheck={false}
                  />
                }
                placeholder={
                  <div className="lexical-placeholder">
                    {placeholder || (isEditMode ? t('chat.editPlaceholder', undefined, '编辑你的消息...') : t('chat.inputPlaceholder'))}
                  </div>
                }
                ErrorBoundary={({ children }: { children: React.ReactNode }) => (
                  <div className="lexical-error-boundary">
                    {children}
                  </div>
                )}
              />
            </div>
            <HistoryPlugin />
            <OnChangePlugin onChange={handleChange} />
            <KeyboardPlugin onSend={handleSend} onClear={handleClear} />
            <DragDropPlugin onFilesDrop={handleFilesDrop} />
            <ClipboardPlugin onImagePaste={handleImagePaste} />
            <FileAutocompletePlugin onFileSelect={handleFileAutoComplete} />
            <SlashCommandPlugin />
            <EditorRefPlugin editorRef={editorRef} onEditorReady={handleEditorReady} />

            {/* 🎯 Refine 按钮 - 浮动在编辑框右下角内部 */}
            <div className="editor-floating-actions">
              {/* 左侧：自定义服务器提示 */}
              {customProxyServerUrl && (
                <div className="custom-proxy-info-badge">
                  {/* info icon - SVG信息图标 */}
                  <svg className="custom-proxy-info-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 17V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="1" cy="1" r="1" transform="matrix(1 0 0 -1 11 9)" fill="currentColor"/>
                    <path d="M7 3.33782C8.47087 2.48697 10.1786 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 10.1786 2.48697 8.47087 3.33782 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {/* info text */}
                  <span className="custom-proxy-info-text">自定义服务器: {customProxyServerUrl}</span>
                </div>
              )}
              {/* 右侧：Refine按钮 */}
              <RefineButton
                inputText={textContent}
                disabled={isLoading || isProcessing || isRefineLoading}
                isLoading={isRefineLoading}
                onRefine={executeRefine}
              />
            </div>
          </div>
        </LexicalComposer>

        {/* 🎯 底部工具栏 - 在输入框外部，形成上下分界关系 */}
        <div className="input-toolbar">
          {/* 左侧：模型选择器、字符计数和快速操作 */}
          <div className="input-footer">
            {/* 模型选择器 - 根据配置显示 */}
            {showModelSelector && (
              <ModelSelector
                selectedModelId={selectedModelId}
                onModelChange={(modelId) => onModelChange?.(modelId)}
                disabled={isLoading || isProcessing}
                isSwitchingFromParent={isModelSwitching} // 🎯 传入模型切换状态
                className="message-input-model-selector"
                sessionId={sessionId}
              />
            )}

            {/* 上下文剩余量指示器 */}
            {tokenUsage && getContextLeftPercentage() !== null && (
              <div className="context-indicator">
                <span className="context-percentage">
                  {getContextLeftPercentage()}%<span className="context-label"> Context Left</span>
                </span>
              </div>
            )}
          </div>

          {/* 右侧：Plan Mode开关、上传按钮和发送按钮 */}
          <div className="input-actions">
            {/* 🎯 Plan Mode切换开关 - 放在上传按钮左边 */}
            <PlanModeToggle
              isPlanMode={isPlanMode}
              onToggle={onTogglePlanMode || (() => {})}
              disabled={isLoading || isProcessing}
            />

            {/* 统一文件上传按钮（图片、代码、Markdown） */}
            <UnifiedFileUploadButton
              onFileSelected={handleFileSelected}
              onBeforeUpload={handleBeforeUpload}
              disabled={isLoading || isProcessing}
            />

            {/* 发送/保存按钮 - 与底部保持一致的样式 */}
            {isProcessing && !textContent.trim() ? (
              <button
                className="send-button processing"
                onClick={onAbortProcess}
                disabled={!canAbort}
                title={canAbort ? t('chat.stopProcessing', {}, 'Stop AI processing') : t('chat.cannotStop', {}, 'Processing cannot be stopped')}
              >
                <Square size={16} stroke="currentColor" />
              </button>
            ) : (
              <button
                className="send-button"
                onClick={handleSend}
                disabled={!textContent.trim()}
                title={isLoading || isProcessing ? 'Add to queue' : t('chat.sendMessage', {}, 'Send message')}
              >
                {isLoading && !isProcessing && !textContent.trim() ? (
                  <div className="button-spinner" />
                ) : (
                  <Send size={16} stroke="currentColor" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>


    </div>
  );
});

// 🎯 设置 displayName 以便调试
MessageInput.displayName = 'MessageInput';