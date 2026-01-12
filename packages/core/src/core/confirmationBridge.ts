/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from '../index.js';
import { ToolExecutionContext } from './toolSchedulerAdapter.js';

/**
 * 确认桥接器接口
 * 
 * 这个接口允许SubAgent优雅地请求用户确认，
 * 而不需要直接耦合到主Agent的UI系统。
 * 
 * TaskTool作为桥接器的实现者，将SubAgent的确认请求
 * 转发给主Agent的确认系统。
//  */
// export interface ConfirmationBridge {
//   /**
//    * 请求用户确认
//    * 
//    * @param details 确认详情
//    * @param context 执行上下文
//    * @returns Promise<ToolConfirmationOutcome> 用户确认结果
//    */
//   requestConfirmation(
//     details: ToolCallConfirmationDetails,
//     context: ToolExecutionContext,
//   ): Promise<ToolConfirmationOutcome>;
// }

/**
 * 空的确认桥接器 - 自动允许所有请求
 * 用于没有UI环境的情况
 */
// export class AutoApprovalBridge implements ConfirmationBridge {
//   async requestConfirmation(
//     details: ToolCallConfirmationDetails,
//     context: ToolExecutionContext,
//   ): Promise<ToolConfirmationOutcome> {
//     // 自动调用原始确认逻辑（用于保持一致性）
//     try {
//       await details.onConfirm(ToolConfirmationOutcome.ProceedOnce);
//     } catch (error) {
//       // 忽略确认回调错误
//     }
    
//     return ToolConfirmationOutcome.ProceedOnce;
//   }
// }
