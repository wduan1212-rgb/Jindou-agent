import { composePromptSegments } from "../src/agent/promptComposer";
import { analyzeCreativeRequest, buildAgentQuestions } from "../src/agent/questionPlanner";
import { createDefaultMemory } from "../src/types/memory";

const memory = createDefaultMemory();
const references = [];

const matureTravelScript = `9:16竖屏，真实感旅行方式广告风格，整体为“从阴雨压抑到阳光治愈”的情绪转折短视频。主角为一位新加坡年轻女性，24-30岁，东南亚面孔，气质干净自然，深棕色中长发，穿简洁舒适的居家都市穿搭。前半段氛围偏灰蓝、安静、略带郁闷感，后半段逐步转为明亮、通透、充满期待的阳光旅行感。画面形式以分屏场景结合手机屏幕操作为核心，镜头语言干净利落，节奏由慢到快，再收束到轻松满足。画面不生成字幕，不生成花字，不生成水印，不生成额外logo；除手机中的 App 界面外，不出现多余品牌元素。可以有真实环境音，但不要口播，不要下载按钮镜头。

0-2s｜阴雨开场｜室内中景 + 氛围建立
室外正在下雨，玻璃窗上有清晰雨滴，远处城市天际线灰蒙蒙的。室内光线偏暗，主角独自坐在窗边或沙发旁，神情略显疲惫和无聊，环境安静，整体有“又下雨了”的压抑感。

3-6s｜手机触发转场｜手部近景 + 手机特写 + 分屏形成
镜头切到主角手部和手机近景，主角拿起手机并打开天气相关界面或旅行搜索界面，开始滑动浏览。画面形成明显分屏：左侧保留室内阴雨环境，右侧随着手机滑动切出第一个目的地——兰卡威晴天风景。右侧重点呈现兰卡威天空之桥，蓝天、阳光、热带山海景观通透清爽。

7-9s｜继续滑动｜手机操作 + 分屏目的地切换
主角继续滑动手机屏幕，分屏右侧切换为槟城场景。右侧画面重点呈现升旗山视角，高处俯瞰城市、山林、缆车或山城氛围，阳光明亮，空气通透。

10-12s｜第三次滑动｜手机特写 + 分屏再次切换
主角继续滑动手机，分屏右侧切换为亚庇场景。右侧重点展示丹绒亚路日落，橙金色晚霞铺满海面，天空通透柔和，海边氛围浪漫治愈。

13-15s｜收束镜头｜手机界面 + 室内放晴感 + 情绪完成
镜头回到主角与手机的中近景或手机特写，手机上出现蓝白配色的旅行 App 首页或预订界面，界面真实、简洁、高级，包含酒店、机票、机票+酒店等模块，具有清晰的一站式旅行预订感。窗外雨势减弱甚至停下，阳光透进室内，主角脸上出现轻松满足的微笑，结尾不出现下载按钮。

整体要求：
重点突出“雨天困住情绪——手机滑动寻找阳光——分屏不断切换目的地——最终被旅行治愈”的完整叙事逻辑。三个核心目的地分别为：兰卡威天空之桥、槟城升旗山、亚庇丹绒亚路日落。`;

const stampScript = `"印章收集型"
0-2s：手拿盖章本，空白页
3-6s：盖章「京都」→ 弹出：京都・伏见稻荷场景
7-9s：盖章「北海道」→ 弹出：北海道・富良野花田场景
10-12s：盖章「沖縄」→ 弹出：沖縄・美ら海场景
13-15s：盖章本合上，出现Trip.com App录屏
16-18s：携程Logo + 下载按钮`;

const cases = [
  {
    name: "vague ad should ask",
    input: "想做一个广告",
    expectQuestions: ["广告主题", "主推对象", "目标受众", "核心情绪"]
  },
  {
    name: "mature travel timeline",
    input: matureTravelScript,
    expectPrompt: ["0-2s", "13-15s", "兰卡威天空之桥", "槟城", "亚庇丹绒亚路日落"],
    rejectPrompt: ["参考图规则", "Seedance"]
  },
  {
    name: "18s stamp timeline",
    input: stampScript,
    expectPrompt: ["0-2s", "13-15s", "16-18s", "伏见稻荷", "富良野花田"],
    rejectPrompt: ["参考图规则", "Seedance"]
  }
];

for (const testCase of cases) {
  const analysis = analyzeCreativeRequest(testCase.input, references, memory);
  const questions = buildAgentQuestions(analysis);
  const prompts = questions.length ? [] : composePromptSegments({ analysis, references, memory });
  const promptText = prompts.map((prompt) => prompt.prompt).join("\n---\n");
  const questionTitles = questions.map((question) => question.title);

  const missingQuestions = testCase.expectQuestions?.filter((title) => !questionTitles.includes(title)) || [];
  const missingPrompt = testCase.expectPrompt?.filter((text) => !promptText.includes(text)) || [];
  const rejectedHits = testCase.rejectPrompt?.filter((text) => promptText.includes(text)) || [];

  const ok = missingQuestions.length === 0 && missingPrompt.length === 0 && rejectedHits.length === 0;
  console.log(
    JSON.stringify(
      {
        name: testCase.name,
        ok,
        specificity: analysis.specificity,
        duration: analysis.duration,
        timelineCount: analysis.timelineCount,
        questions: questionTitles,
        segments: prompts.map((prompt) => prompt.timeRange),
        missingQuestions,
        missingPrompt,
        rejectedHits
      },
      null,
      2
    )
  );

  if (!ok) process.exitCode = 1;
}
