/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
// /**
//  * Status Bar Component - Shows application status and statistics
//  */

// import React from 'react';
// import { useTranslation } from '../hooks/useTranslation';

// interface StatusBarProps {
//   isLoading: boolean;
//   messageCount: number;
//   successfulExecutions: number;
//   failedExecutions: number;
// }

// export const StatusBar: React.FC<StatusBarProps> = ({
//   isLoading,
//   messageCount,
//   successfulExecutions,
//   failedExecutions
// }) => {
//   const { t } = useTranslation();
//   const totalExecutions = successfulExecutions + failedExecutions;
//   const successRate = totalExecutions > 0 ? 
//     Math.round((successfulExecutions / totalExecutions) * 100) : 
//     0;

//   return (
//     <div style={{
//       display: 'flex',
//       alignItems: 'center',
//       justifyContent: 'space-between',
//       padding: '4px 16px',
//       backgroundColor: 'var(--vscode-statusBar-background)',
//       color: 'var(--vscode-statusBar-foreground)',
//       borderTop: '1px solid var(--vscode-panel-border)',
//       fontSize: '12px',
//       minHeight: '24px'
//     }}>
//       {/* Left side - Status */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//         <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
//           {isLoading ? (
//             <>
//               <div style={{
//                 width: '12px',
//                 height: '12px',
//                 border: '2px solid transparent',
//                 borderTop: '2px solid var(--vscode-statusBar-foreground)',
//                 borderRadius: '50%',
//                 animation: 'spin 1s linear infinite'
//               }} />
//               <span>{t('status.processing')}</span>
//             </>
//           ) : (
//             <>
//               <span style={{ color: 'var(--vscode-terminal-ansiGreen)' }}>●</span>
//               <span>{t('status.ready')}</span>
//             </>
//           )}
//         </div>

//         <div style={{ opacity: 0.7 }}>
//           💬 {messageCount} {t('status.messages')}
//         </div>
//       </div>

//       {/* Right side - Statistics */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//         {totalExecutions > 0 && (
//           <>
//             <div style={{ opacity: 0.7 }}>
//               {t('status.successRate')} {successRate}%
//             </div>
            
//             <div style={{ opacity: 0.7 }}>
//               ✅ {successfulExecutions} 
//               {failedExecutions > 0 && (
//                 <span style={{ marginLeft: '4px' }}>
//                   ❌ {failedExecutions}
//                 </span>
//               )}
//             </div>
//           </>
//         )}

//         <div style={{ 
//           opacity: 0.5, 
//           fontSize: '11px',
//           display: 'flex',
//           alignItems: 'center',
//           gap: '4px'
//         }}>
//           <span>DeepV AI</span>
//           <span style={{ 
//             backgroundColor: 'var(--vscode-badge-background)',
//             color: 'var(--vscode-badge-foreground)',
//             padding: '1px 4px',
//             borderRadius: '2px',
//             fontSize: '10px'
//           }}>
//             {t('status.version')}
//           </span>
//         </div>
//       </div>

//       <style>
//         {`
//           @keyframes spin {
//             0% { transform: rotate(0deg); }
//             100% { transform: rotate(360deg); }
//           }
//         `}
//       </style>
//     </div>
//   );
// };