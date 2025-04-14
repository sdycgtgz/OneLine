import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { type TimelineData, TimelineEvent, type Person } from '@/types';

// 修改系统提示，使用分段文本格式而不是JSON
const SYSTEM_PROMPT = `
你是一个专业的历史事件分析助手。我需要你将热点事件以时间轴的方式呈现。
请按照以下格式返回数据（使用文本分段格式，不要使用JSON）：

===总结===
对整个事件的简短总结

===事件列表===

--事件1--
日期：事件发生日期，格式为YYYY-MM-DD，如果只知道月份则为YYYY-MM，如果只知道年份则为YYYY
标题：事件标题
描述：事件详细描述
相关人物：人物1(角色1,#颜色代码1);人物2(角色2,#颜色代码2)
来源：事件信息来源，如新闻媒体、官方公告、研究报告等

--事件2--
日期：...
标题：...
描述：...
相关人物：...
来源：...

... 更多事件 ...

请确保：
1. 按时间先后顺序组织事件（从最早到最近）
2. 为每个相关人物分配不同的颜色代码，让用户能够轻松识别不同人物的动向
3. 同一立场的人物使用相似的颜色
4. 尽可能客观描述各方观点和行为
5. 为每个事件标注可能的信息来源
6. 严格按照上述格式返回，不要添加其他格式
`;

type ApiConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
};


// 解析文本响应，转换为TimelineData格式
function parseTimelineText(text: string): TimelineData {
  try {
    const result: TimelineData = {
      events: [],
      summary: ""
    };

    // 提取总结部分
    const summaryMatch = text.match(/===总结===\s*([\s\S]*?)(?=\s*===事件列表===|$)/);
    if (summaryMatch?.[1]) {
      result.summary = summaryMatch[1].trim();
    }

    // 提取事件列表
    const eventsMatch = text.match(/===事件列表===\s*([\s\S]*?)(?=$)/);
    if (eventsMatch?.[1]) {
      const eventsText = eventsMatch[1].trim();
      const eventBlocks = eventsText.split(/\s*--事件\d+--\s*/).filter(block => block.trim().length > 0);

      result.events = eventBlocks.map((block, index) => {
        // 提取日期
        const dateMatch = block.match(/日期：\s*(.*?)(?=\s*标题：|$)/);
        const date = dateMatch?.[1]?.trim() || "";

        // 提取标题
        const titleMatch = block.match(/标题：\s*(.*?)(?=\s*描述：|$)/);
        const title = titleMatch?.[1]?.trim() || "";

        // 提取描述
        const descMatch = block.match(/描述：\s*(.*?)(?=\s*相关人物：|$)/);
        const description = descMatch?.[1]?.trim() || "";

        // 提取相关人物
        const peopleMatch = block.match(/相关人物：\s*(.*?)(?=\s*来源：|$)/);
        const peopleText = peopleMatch?.[1]?.trim() || "";
        const people: Person[] = [];

        if (peopleText) {
          const personEntries = peopleText.split(';').map(p => p.trim()).filter(p => p.length > 0);

          // 使用for...of替代forEach
          for (const personEntry of personEntries) {
            // 格式：人物名(角色,#颜色)
            const personMatch = personEntry.match(/(.*?)\((.*?),(.*?)\)/);
            if (personMatch) {
              people.push({
                name: personMatch[1].trim(),
                role: personMatch[2].trim(),
                color: personMatch[3].trim()
              });
            } else {
              // 防止格式不完整，至少提取人名
              const simpleName = personEntry.split('(')[0].trim();
              if (simpleName) {
                // 使用随机颜色
                const randomColor = `#${Math.floor(Math.random()*16777215).toString(16)}`;
                people.push({
                  name: simpleName,
                  role: "相关人物",
                  color: randomColor
                });
              }
            }
          }
        }

        // 提取来源
        const sourceMatch = block.match(/来源：\s*(.*?)(?=\s*--事件|$)/);
        const source = sourceMatch?.[1]?.trim() || "未指明来源";

        // 创建事件对象
        return {
          id: `event-${index}`,
          date,
          title,
          description,
          people,
          source
        };
      });

      // 按日期排序（从早到晚）
      result.events.sort((a, b) => {
        const dateA = a.date.replace(/\D/g, ''); // 移除非数字字符
        const dateB = b.date.replace(/\D/g, '');
        return dateA.localeCompare(dateB);
      });
    }

    return result;
  } catch (error) {
    console.error("解析文本响应失败:", error);
    return { events: [] };
  }
}



export async function POST(req: NextRequest) {
  try {
    const { query, apiConfig }: { query: string; apiConfig: ApiConfig } = await req.json();

    const payload = {
      model: apiConfig.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请为以下事件创建时间轴：${query}` }
      ],
      temperature: 0.7
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.apiKey}`
    };

    const response = await axios.post(apiConfig.endpoint, payload, { headers });
    let content = response.data.choices[0].message.content;
	content = parseTimelineText(content);

    return NextResponse.json( content );
  } catch (error: any) {
    console.error('Timeline API request failed:', error?.response?.data || error.message);
    return NextResponse.json({ error: '调用 Timeline API 失败' }, { status: 500 });
  }
}