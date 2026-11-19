# 시각 연출 조사 — 다른 리듬·퍼즐 게임은 연출을 어떻게 쌓아 가나

의견: "라운드가 가면 갈수록 연출이 점점 발전되었으면 한다. 연출에도 차등을 주고 싶다", "2단계(무대)부터는 뭔가 변경된 게 보여야 한다", "시각 연출을 다른 리듬 퍼즐 게임이랑 비교해 보게 조사해서 문서화해 봐".

이 문서는 (1) 다른 게임들이 시각 연출을 **어떻게 단계적으로 키우는지**, (2) **음악과 어떻게 맞추는지**, (3) **연출이 많아져도 읽기 쉬움을 어떻게 지키는지**를 정리하고, (4) Pulse Bounce의 연출 단계안을 다시 짠다.

> 조사 방법과 한계: 웹 검색으로 개발자 인터뷰·공식 문서·리뷰를 찾았다. 개발자가 직접 말한 것(Beat Saber, Sayonara Wild Hearts, Tetris Effect, Rez, Thumper)은 믿을 만하다. 리뷰에서 나온 것은 "리뷰어가 본 것"이고, 팬 위키·자동 요약 사이트에서만 나온 것은 따로 표시했다(신뢰 낮음). Geometry Dash, A Dance of Fire and Ice, Dancing Line은 연출 단계를 설명하는 믿을 만한 글을 찾지 못해 짧게만 적었다. 실제 화면을 보고 확인한 것은 아니다.

---

## 1. 게임별 정리

| 게임 | 연출을 키우는 방식 | 음악과 맞추는 방식 | 읽기 쉬움을 지키는 방식 |
|---|---|---|---|
| **Rez / Rez Infinite** | 한 구역(Area)이 **10개의 층(layer)**. 층을 지날 때마다 음악이 한 단계 진화하고 화면도 바뀐다. 구역 5는 바다의 미생물에서 시작해 생명의 진화를 따라간다 | 쏘는 소리가 배경 곡에 맞춰 울려 음악에 층을 더한다. 칸딘스키에서 따온 와이어프레임, 공감각이 출발점 | 와이어프레임처럼 단순한 그림 |
| **Tetris Effect** | 여정 모드: 일곱 지역, 27개 안팎의 스테이지가 하나의 이야기(깊은 바다 → 달 표면 …). 같은 테트리스에 스테이지마다 다른 세계 | 그래픽 대부분을 **입자**로 만들었다(음악에 잘 반응해서). 배경이 플레이(줄 지우기 등)와 박자에 맞춰 뛰고 움직인다. 입력 소리도 곡의 박에 맞춰 양자화 | 판(그리드)은 그대로, 바뀌는 것은 배경 |
| **Lumines** | **스킨**이 곧 진행: 일정량을 지우면 스킨(그림 + 곡)이 바뀐다. 다음 버전(Electronic Symphony)은 스킨 안에 **고조 지점(escalation point)**을 두어 배경과 곡이 조금씩 더 바뀐다 | 곡과 스킨을 같이 만들었다(곡이 끝나야 스킨을 마무리) | 레벨 표시로 **바뀔 때를 미리 알 수 있다**. 리뷰: 어떤 스킨은 멋지고 어떤 스킨은 밋밋하다(질의 편차) |
| **Thumper** | 개발 내내 "더 빠르게, 더 깊게" 한 방향으로 키웠다. 강도는 **후처리**(블룸, 채도, 입체 왜곡, 방사 블러, 비네트)로 올렸다 | 트랙의 굽이·장애물이 박자에 맞춰 온다 | 화면이 빨리 지나가므로 **신호를 빨리 읽을 수 있게** 그림을 다듬었다(많은 그림 요소가 "빨리 알려 주기"에서 나왔다). 색은 차분한 파랑·하양·초록, 모양은 날카롭게 |
| **Beat Saber** | 곡마다 환경(무대)이 다르고, 환경마다 움직일 수 있는 조명이 다르다 | 조명을 **손으로** 곡에 맞춘다. 블록 951개인 곡에 조명 이벤트 3000개 넘게. 가사에 맞춘 조명, 곡 제목이 나올 때까지 파랑·빨강을 떼어 두는 연출, 천둥소리를 흉내 낸 번개 | **난이도마다 조명을 따로**: 가장 어려운 난이도의 센 깜빡임이 쉬운 난이도를 덮지 않게 |
| **Sayonara Wild Hearts** | 레벨 하나 = 팝 앨범의 곡 하나. **레벨마다 그림이 확 다르다**. 로고만 봐도 어느 레벨인지 알 수 있게 레벨의 상징을 넣었다 | 곡의 빠르기가 레벨의 속도를 정하고, 곡의 흐름(오르내림)을 따라간다. 감독이 곡을 들으면 색이 보여서 팔레트가 분명했다 | 적은 인원이 만들 수 있으면서 강한 스타일(네온, 로우폴리)을 골랐다 |
| **Rhythm Doctor** | 화면 효과 자체가 장애물: 큰 박에 화면이 떨리고, 작은 흔들림에서 글리치로, 창이 움직이고, 게임이 멈춘 척까지 한다 | 효과마다 이야기의 이유가 있다(바이러스가 연결을 방해) | 비판도 있다: 눈으로 박을 보는 사람에게 짜증(IGN), 처음 하는 사람이 좌절할 수 있다 |
| **Just Shapes & Beats** | 곡(보스)마다 다른 연출 | 모든 것이 곡에 맞춰 움직인다 | **분홍 = 위험, 나머지 = 안전**의 약속 하나로 처음 하는 사람도 규칙을 바로 안다(예외가 조금 있다). 플레이어는 하늘색 네모 |
| **Crypt of the NecroDancer** | — | 박마다 뛰는 심장과 그쪽으로 모이는 눈금으로 **박을 화면에 보여 준다** | 개발자 비교: "박 찾기"에 집중하게 하면 안 된다 → 박을 눈으로 보여 준다 |
| **Rolling Sky / Rolling Sky 2** (모바일, 광고형) | 스테이지마다 주제(산, 우주, 숲, 눈 언덕, 지옥불, 사탕, 바이올린 목 위 …)와 곡이 다르다 | 리듬이 언제 무엇을 할지 알려 준다 | 리뷰: 레벨끼리 달라서 여러 게임을 하는 것 같다 / 반대로 그림이 단조롭다는 평도 있다 |
| **Dancing Line** (모바일, 광고형) | 세계마다 난이도가 오르고 그림과 감정이 다르다(사막, 가을 …) | 선이 박에 꺾이고, 곡이 바뀌면 그림도 바뀐다 | 뒤 레벨에서는 길잡이 선을 없앤다(외워야 한다) |
| **Geometry Dash** | 에디터의 Pulse·Color 트리거로 색과 깜빡임을 시점마다 바꾼다. (신뢰 낮음: 공식 레벨이 뒤로 갈수록 어두운 공업 → 밝고 사이키델릭하게 간다는 글) | 박에 맞춘 깜빡임(Pulse) | — |
| **A Dance of Fire and Ice** | 세계(20개 넘게)마다 새 모양과 리듬. 세계 = 짧은 연습 판들 + 곡 전체를 치는 마지막 판 | — | (리뷰 요약, 신뢰 낮음) 그림이 예쁘다는 평, 소리·그림이 어긋나는 버그 지적 |

---

## 2. 공통 패턴

### 2-1. 한 겹씩 더해 간다 — 그리고 그 경계가 보인다
- Rez의 **층(layer)**, Lumines의 **고조 지점**, Tetris Effect의 **여정**: 같은 놀이에 그림과 소리를 **층으로 더한다.** 다음 층으로 넘어갈 때 음악과 화면이 함께 바뀌어, 더해진 것이 분명히 느껴진다.
- Lumines는 바뀔 때를 **미리 알려 준다**(레벨 표시). 바뀌는 순간이 놀람이 아니라 보상이 된다.
- → **"조금 더 좋아졌다"가 아니라 "새것이 생겼다"가 보여야 한다.** 은근히 짙어지는 것은 알아채기 어렵다. 이것이 "2단계부터는 변경된 게 보여야 한다"는 의견과 같은 이야기다.

### 2-2. 눈이 가는 곳이 바뀌어야 알아챈다
- Thumper: 화면이 빨리 지나가서 플레이어는 **신호(길, 장애물)**만 본다. 그래서 그림 요소가 "빨리 읽히게" 다듬어졌다.
- Pulse Bounce도 플레이 중 눈은 **공과 그 앞의 길·박스·장애물**에 있다. 해와 먼 풍경은 눈 가장자리에 있다.
- → **풍경만 바꾸면 "바뀐 게 안 보인다".** 단계가 올라갈 때는 **눈이 가는 곳(길·박스·공의 꼬리)**에도 바뀐 것이 하나 있어야 한다.

### 2-3. 세계마다 확 다르게, 상징 하나로 알아보게
- Sayonara Wild Hearts는 레벨마다 그림이 확 다르고, 로고의 상징만으로 레벨을 알아본다. Rolling Sky도 "여러 게임을 하는 것 같다"는 평을 받는다.
- → 월드마다 **한눈에 알아보는 상징 하나**(네온의 줄무늬 해, 산맥의 눈 덮인 봉우리, 축제의 등롱 줄 …)를 분명히 한다. 지금 일곱 월드는 이미 이렇게 되어 있다.

### 2-4. 음악의 사건에 맞춘 연출이 "손맛"을 만든다
- Beat Saber는 블록보다 조명 이벤트가 세 배 많고, 가사·곡 제목·천둥 같은 **곡의 사건**에 맞춘다. Tetris Effect는 입자가 소리와 플레이에 반응한다.
- → 박마다 똑같이 뛰는 것(지금의 고리·창문 깜빡임)에서 한 걸음 더: **곡의 구간이 바뀌는 순간, 가장 센 구간, 끝맺는 한 방**에 맞춘 연출이 단계가 높을수록 늘어나야 한다.

### 2-5. 위험의 색은 하나로, 끝까지
- Just Shapes & Beats는 "분홍 = 위험" 하나로 규칙을 가르친다(예외가 있으면 헷갈린다는 지적).
- → Pulse Bounce의 "빨강 = 죽음, 파랑 = 안전"을 연출이 화려해져도 깨지 않는다. 재질을 바꿔도 **분홍 빛 테두리**는 모든 월드 공통으로 둔다(지금 원칙 그대로).

### 2-6. 화면 효과는 세기를 조절한다
- Thumper는 후처리로 강도를 올렸고, Rhythm Doctor는 화면 효과를 장애물로 썼다. 그런데 Rhythm Doctor는 **"눈으로 박을 보는 사람에게 짜증"**이라는 비판을 받았고, Beat Saber는 **센 깜빡임이 쉬운 난이도를 덮지 않게** 난이도마다 조명을 나눴다.
- → 우리는 판정을 방해하는 화면 효과는 쓰지 않는다(지금 원칙). 후처리(가벼운 비네트, 번짐)는 **뒤 단계에서, 박자에 맞춰, 통로를 가리지 않게**만. 쉬운 앞 라운드에는 쓰지 않는다.

### 2-7. 박은 화면에 보여 준다
- NecroDancer는 박을 화면에 보여 줘서 "박 찾기"가 놀이가 되지 않게 한다.
- → Pulse Bounce는 이미 박자 고리, 착지 자리 표시, 박마다 뛰는 풍경이 있다. 단계가 올라가도 이 **박의 신호는 줄이지 않는다**(연출이 박을 가리지 않게).

---

## 3. Pulse Bounce에 적용: 연출 단계안 (고친 판)

처음 안(2단계 = 하늘·해·먼 풍경만)은 바뀌는 것이 눈 가장자리에만 있어서 **"바뀐 게 안 보일" 위험**이 있었다(2-2). 고친 안은 단계마다 **눈이 가는 곳에 새것 하나**를 반드시 둔다.

| 단계 | 라운드 | 배경(눈 가장자리) | 플레이 영역(눈이 가는 곳) | 음악 연동 |
|---|---|---|---|---|
| 1 기본 | 1~5 | 기본 그림(둥근 해, 막대 풍경) | 기본(검은 길, 파란 유리판, 빗금) | 박마다 고리·막대 |
| 2 무대 | 6~9 | **월드의 하늘·해·먼 풍경** | **길이 바뀐다**: 땅의 결과 윗선 장식(차선, 눈, 이끼 …) + **공 꼬리 입자** + **파란 박스·빨간 덩어리의 재질**(아래 "정한 것"에서 2단계로 당겼다) | 박마다 뛰는 풍경(창문, 연기 …) |
| 3 질감 | 10~13 | + 평소의 날씨(비, 눈, 먼지 …) | (재질은 2단계로 옮겼다) | + **구간이 바뀌는 순간** 하늘이 번쩍이며 다음 색으로 |
| 4 완성 | 14~18 | + 가까운 전경 한 겹(화면 가장자리, 통로 밖) + 가벼운 비네트·빛 번짐 | + **움직이는 장애물의 겉모습**(프레스, 톱날 …), 착지할 때 땅의 반응 | + **실제 곡 소리**에 반응하는 풍경, **가장 센 구간**에서 연출 최대, 끝맺는 한 방 연출 |

- **라운드 안에서도 쌓는다(Rez·Lumines 방식)**: 3단계부터는 곡의 구간에 따라 연출을 한 겹씩 켠다. 도입(intro)에는 덜, 가장 센 구간(지금 코스의 `c`·`d`)에서 가장 많이. 같은 라운드 안에서도 곡이 커지는 것이 화면으로 보인다.
- **같은 월드가 다시 나오면 더 화려해진다**: 네온(6 → 9)은 둘 다 2단계, 축제(7 → 11 → 18)는 2 → 3 → 4단계, 산맥(8 → 12)은 2 → 3단계, 유적(14·16)·깊은 곳(15·17)은 4단계. 같은 무대가 다시 나올 때 "이번엔 더 있다"가 보인다.
- **단계가 오를 때 알려 준다(Lumines 방식)**: 라운드를 고르는 화면이나 시작할 때, 새로 더해진 것을 짧게 보여 주는 것을 생각해 볼 만하다(정하지 않음).
- **지키는 것(바뀌지 않음)**: 빨강 = 죽음, 파랑 = 안전 / 윤곽 = 판정 / 통로 안에는 그리지 않는다 / 박의 신호(고리, 착지 표시)는 줄이지 않는다 / 화면을 흔들거나 가리는 효과는 쓰지 않는다 / 무거운 번짐(shadowBlur)은 쓰지 않는다(폰에서 끊김).

### 정한 것과 만든 것
의견: "1. OK(경계 6 / 10 / 14)", "2. 박스 재질도 2단계로 하자".

| 단계 | 라운드 | 만든 것 |
|---|---|---|
| 1 기본 | 1~5 | 처음의 그림 그대로 |
| 2 무대 | 6~9 | 월드의 하늘·해·먼 풍경 + **길의 결과 윗선 장식, 공 꼬리, 파란 박스·빨간 덩어리의 재질**(월드마다: 네온관 유리 상자 / 홀로그램 / 철제 컨테이너 / 얼음 / 유약 돌판 / 수정 / 선물 상자, 장애물은 네온 경고등 / 글리치 / 달군 쇠 / 용암석 / 룬 새긴 돌 / 성게 가시 / 금테 옻칠) |
| 3 질감 | 10~13 | + **평소의 날씨**(곡이 셀수록 짙게: 마디마다 곡의 소리 크기를 재 둔다), **곡 구간이 바뀌는 순간** 하늘이 번쩍이고 해에서 고리가 퍼진다 |
| 4 완성 | 14~18 | + **실제 곡 소리**에 반응하는 박동(풍경의 깜빡임·빛살·창문이 곡의 낮은 소리를 따라 뛴다), **곡의 가장 센 마디**에서 화면 가장자리가 박마다 숨 쉰다 |

- 아직 안 한 것(4단계 후보): 가까운 전경 한 겹(가로 화면은 땅 밑이 한 칸 반뿐이라 자리를 다시 생각해야 한다), 착지할 때 땅의 반응, 끝맺는 한 방 연출. 움직이는 장애물은 프레스 머리만 월드 재질을 입었다(14~18라운드의 돌추·불기둥·해파리·등롱은 라운드마다 이미 따로 그린 것).
- 개발자 모드의 월드 미리 보기는 그 월드를 **가장 높은 단계(4)**로 입힌다(월드의 모든 그림을 보려고).

---

## 출처
신뢰 표시: ◎ 개발자·공식 / ○ 리뷰·기사 / △ 팬 위키·자동 요약·출처가 불분명한 글

- Rez: [PlayStation Blog — Classic Levels Deconstructed: Rez Infinite's Area 5](https://blog.eu.playstation.com/2017/10/20/classic-levels-deconstructed-tetsuya-mizuguchi-musician-adam-freeland-dissect-rez-infinites-area-5) ◎, [Wikipedia — Rez](https://en.wikipedia.org/wiki/Rez_(video_game)) ○, [MCV — Tetsuya Mizuguchi: Synaesthesia](https://www.mcvuk.com/development-news/tetsuya-mizuguchi-synaesthesia/) ○
- Tetris Effect: [Unreal Engine — How Tetris Effect became a modern work of art](https://www.unrealengine.com/developer-interviews/how-tetris-effect-became-a-modern-work-of-art) ◎, [Wccftech — Interview with Tetsuya Mizuguchi](https://wccftech.com/interview-tetsuya-mizuguchi-synesthesia-tetris-effect-rez-lumines/) ◎, [GamesBeat — Mizuguchi interview](https://gamesbeat.com/tetsuya-mizuguchi-interview-taking-tetris-on-a-ps-vr-acid-trip/) ◎, [God is a Geek review](https://www.godisageek.com/reviews/tetris-effect-review/) ○, [Push Square — Lumines Arise interview](https://www.pushsquare.com/features/interview-lumines-arise-could-be-the-most-emotional-high-end-puzzle-game-you-ever-play) ◎
- Lumines: [GamesBeat — Lumines Electronic Symphony review](https://gamesbeat.com/review-lumines-electronic-symphony/) ○, [GameSpot — Lumines Electronic Symphony review](https://gamespot.com/reviews/lumines-electronic-symphony-review/1900-6350796/) ○, [PC Gamer — Lumines Remastered review](https://www.pcgamer.com/lumines-remastered-review/) ○, [Wikipedia — Lumines](https://en.wikipedia.com/wiki/Lumines) ○
- Thumper: [Game Developer — How Thumper uses striking visuals to complement gameplay](https://gamedeveloper.com/design/how-i-thumper-i-uses-striking-visuals-to-complement-gameplay-at-every-turn) ○(개발자 인터뷰 인용), [Thumbsticks — GDC 17: How Thumper turned into something special](https://www.thumbsticks.com/gdc-17-how-thumper-turned-into-something-special/) ○, [GDC Vault — Seven Years in Alpha: Thumper](https://gdcvault.com/play/1024291/Seven-Years-in-Alpha-Thumper) ◎, [Cane and Rinse — Thumper interview](https://caneandrinse.com/thumper-interview/) ◎, [PC Gamer — Thumper review](https://pcgamer.com/thumper-review) ○
- Beat Saber: [PlayStation Blog — How the Beat Saber devs make their game feel so fun](https://blog.playstation.com/2019/06/27/how-the-beat-saber-devs-make-their-game-feel-so-fun/) ◎, [Beat Saber 문서 — The Static Event System](https://www.beatsaber.com/documentation/the-static-event-system/index.html) ◎, [BSMG Wiki — Basic Lighting](https://bsmg.wiki/mapping/basic-lighting) △
- Sayonara Wild Hearts: [Apple — Behind the Design: Sayonara Wild Hearts](https://developer.apple.com/news/?id=33kvkagk) ◎, [Simogo — Sayonara Wild Hearts](https://www.simogo.com/sayonara-wild-hearts/) ◎, [EGM — Let's Pop: Simogo on building the bubblegum dream](https://egmnow.com/lets-pop-simogo-on-building-the-bubblegum-dream-of-sayonara-wild-hearts/) ◎, [God is a Geek review](https://www.godisageek.com/reviews/sayonara-wild-hearts-review) ○
- Rhythm Doctor: [PC Gamer — the best distraction mechanics](https://pcgamer.com/rhythm-doctor-has-the-best-distraction-mechanics-ive-seen-in-any-rhythm-game) ○, [PC Gamer review](https://pcgamer.com/games/rhythm/rhythm-doctor-review) ○, [Game Developer — medical stories and heart conditions in Rhythm Doctor](https://www.gamedeveloper.com/design/using-medical-stories-and-heart-conditions-to-create-musical-challenges-in-rhythm-doctor) ◎, [TV Tropes — Rhythm Doctor](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/RhythmDoctor) △
- Just Shapes & Beats: [Game Developer — How jams become levels in Just Shapes & Beats](https://gamedeveloper.com/design/how-jams-become-levels-in-the-co-op-bullet-hell-musical-i-just-shapes-beats-i-) ◎, [Pure Nintendo review](https://purenintendo.com/review-just-shapes-beats-nintendo-switch/) ○, [TV Tropes — Just Shapes & Beats](https://tvtropes.org/pmwiki/pmwiki.php/Videogame/JustShapesAndBeats) △
- Crypt of the NecroDancer: [Game Developer — Finding the beat in Crypt of the NecroDancer](https://gamedeveloper.com/audio/game-design-deep-dive-finding-the-beat-in-i-crypt-of-the-necrodancer-i-) ◎, [Engadget — The sight of music: the art behind Crypt of the NecroDancer](https://www.engadget.com/2014-02-12-the-sight-of-music-the-art-behind-crypt-of-the-necrodancer.html) ○, [Wireframe — Beyond rhythm](https://wireframe.raspberrypi.com/articles/beyond-rhythm-the-new-face-of-musical-action-games) ○
- Rolling Sky: [Pocket Gamer — Rolling Sky 2 review](https://www.pocketgamer.com/articles/080009/rolling-sky-2-rolling-dream-review-an-auto-runner-that-just-keeps-on-rolling/) ○, [App Store — Rolling Sky](https://apps.apple.com/app/1036661603) ◎
- Dancing Line: [App Store — Dancing Line](https://apps.apple.com/us/app/-/id1177953618) ◎, [Noobfeed review](https://noobfeed.com/reviews/dancing-line-review) ○, [Dancing Line Wiki](https://dancingline.fandom.com/wiki/Dancing_Line) △
- Geometry Dash: [RobTop — GD Editor 안내(PDF)](https://www.robtopgames.com/files/GDEditor.pdf) ◎, [games.gg — Geometry Dash](https://games.gg/geometry-dash/) △(공식 레벨의 그림 흐름에 대한 글. 확인되지 않음)
- A Dance of Fire and Ice: [Steam — A Dance of Fire and Ice](https://store.steampowered.com/app/977950) ◎, [Vaporlens 리뷰 요약](https://vaporlens.app/app/977950/a_dance_of_fire_and_ice) △
