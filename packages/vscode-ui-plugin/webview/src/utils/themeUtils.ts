/**
 * VS Code 主题工具函数
 * 用于检测和适配不同的主题
 */

/**
 * 检测当前是否为亮色主题
 * @returns boolean
 */
export const isLightTheme = (): boolean => {
  try {
    const style = getComputedStyle(document.body);
    const bgColor = style.getPropertyValue('--vscode-editor-background');

    // 如果背景色包含白色相关值，认为是亮色主题
    if (bgColor.includes('#fff') || bgColor.includes('255, 255, 255') || bgColor.includes('rgb(255')) {
      return true;
    }

    // 通过背景色的亮度判断
    if (bgColor.startsWith('#')) {
      const hex = bgColor.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);

      // 计算亮度 (0-255)
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 128;
    }

    return false;
  } catch (error) {
    console.warn('Failed to detect theme:', error);
    return false;
  }
};

/**
 * 获取当前主题类型
 * @returns 'light' | 'dark' | 'unknown'
 */
export const getThemeType = (): 'light' | 'dark' | 'unknown' => {
  try {
    if (isLightTheme()) {
      return 'light';
    }
    return 'dark';
  } catch (error) {
    console.warn('Failed to get theme type:', error);
    return 'unknown';
  }
};

/**
 * 根据主题返回适配的颜色
 * @param lightColor 亮色主题下的颜色
 * @param darkColor 暗色主题下的颜色
 * @returns string
 */
export const getThemeColor = (lightColor: string, darkColor: string): string => {
  return isLightTheme() ? lightColor : darkColor;
};

/**
 * 获取主题适配的透明度
 * @param lightOpacity 亮色主题下的透明度
 * @param darkOpacity 暗色主题下的透明度
 * @returns number
 */
export const getThemeOpacity = (lightOpacity: number, darkOpacity: number): number => {
  return isLightTheme() ? lightOpacity : darkOpacity;
};

/**
 * 应用主题类到元素
 * @param element HTML元素
 */
export const applyThemeClass = (element: HTMLElement): void => {
  const theme = getThemeType();
  element.classList.remove('theme-light', 'theme-dark');
  if (theme !== 'unknown') {
    element.classList.add(`theme-${theme}`);
  }
};

/**
 * 监听主题变化
 * @param callback 主题变化时的回调函数
 * @returns 清理函数
 */
export const watchThemeChange = (callback: (theme: 'light' | 'dark' | 'unknown') => void): (() => void) => {
  let currentTheme = getThemeType();

  const observer = new MutationObserver(() => {
    const newTheme = getThemeType();
    if (newTheme !== currentTheme) {
      currentTheme = newTheme;
      callback(newTheme);
    }
  });

  // 监听body的style属性变化
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  // 监听CSS变量变化
  const checkThemeChange = () => {
    const newTheme = getThemeType();
    if (newTheme !== currentTheme) {
      currentTheme = newTheme;
      callback(newTheme);
    }
  };

  // 定期检查主题变化（作为备用方案）
  const interval = setInterval(checkThemeChange, 1000);

  return () => {
    observer.disconnect();
    clearInterval(interval);
  };
};