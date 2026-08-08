import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';

// DeepSeek 输出行内公式常用 $...$，需显式开启（插件默认关闭以防金额误判）
const math = createMathPlugin({ singleDollarTextMath: true });
const PLUGINS = { code, math, cjk };

/**
 * 流式 Markdown 渲染：Streamdown 专为 AI 流式输出设计——
 * 未闭合代码块/表格/加粗的渐进渲染、按 block 粒度 memo、Shiki 高亮、
 * KaTeX 公式、代码块自带复制按钮。
 * streaming=true 时启用未终结语法块解析（parseIncompleteMarkdown）。
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="md-body text-[15px]">
      <Streamdown
        plugins={PLUGINS}
        parseIncompleteMarkdown={streaming}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {content}
      </Streamdown>
    </div>
  );
});
