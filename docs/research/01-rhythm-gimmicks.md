# 리듬게임 기믹/함정 조사 보고서 (1차)

> 목적: RythmnEscape(그리드 턴제 탈출, 플레이어 1점프 → 적 1행동)에 쓸 퍼즐 재료 수집
> 작성일: 2026-11-17

---

## 0. 요약

- 리듬게임 기믹은 크게 **언제(타이밍) / 어디로(공간) / 무엇이 보이나(정보) / 어떻게 입력하나(규칙)** 네 축으로 나뉜다.
- 턴제 게임으로 옮기면 "박자"는 **턴 카운터**가 된다. 적마다 **주기(N턴에 1번)**와 **위상(몇 번째 턴에 움직이나)**을 주는 것만으로도 퍼즐 공간이 크게 넓어진다.
- 이 구조가 실제로 통한다는 증거: *Cadence of Hyrule*의 **Fixed-Beat Mode**는 박자를 없애고 적이 플레이어가 움직일 때만 움직이게 바꿨다. 우리 게임의 기본 규칙과 같다.
- 퍼즐로서 공정하려면 **예고(텔레그래프) + 결정론**이 핵심이다(Into the Breach). 정보를 가리는 기믹은 멋있지만 불공정해지기 쉽다(Dan Lew, Phigros 커뮤니티).

---

## 1. 사례별 조사

### 1-1. Crypt of the NecroDancer / Cadence of Hyrule (가장 가까운 레퍼런스)
- 적은 모두 박자에 맞춰 움직이고, **종류마다 고유 패턴**이 있다. 예: 스켈레톤은 2박에 1번, 오렌지 슬라임은 일정한 루프를 돈다. 나이트는 뒤로 물러났다가 돌진한다.
- Cadence of Hyrule: 적은 공격 전에 **예고 동작**을 보인다(곤봉을 들어올리기, 머리 위 표시 등). 예시: "3박마다 대각선 이동", "2박 정지 → 3박째 차지 → 4박째 범위 공격".
- 개발자 Ryan Clark의 설계 노트(Gamedeveloper Deep Dive, 2014):
  - 처음엔 판정 폭을 박자의 20%로 엄격하게 잡았다. 결국 **100%(사실상 박자만 맞으면 OK)**가 가장 좋았다. "리듬게임을 흉내 낸 건 현명하지 못했다."
  - 이유: 플레이어는 가장 긴장한 순간에 가장 부정확하다. 그때 판정 실패로 죽으면 불공정하게 느껴진다.
  - 첫 프로토타입은 "플레이어는 정박, 적은 반박"이었다. 예측은 쉬웠지만 세계가 박자에 맞아 보이지 않았다. 최종판은 **둘 다 정박에 움직이고 플레이어 행동을 우선 처리**한다.
  - 결론: **도전은 리듬 정확도가 아니라 전술 판단에서 나와야 한다.**
- 함정(커뮤니티 공략 기준): 바운스 트랩(강제 이동), 트랩도어(아래층으로 떨어짐, 약 5박 소요), 템포 업/다운 트랩, 폭탄 트랩, 스캐터 트랩. 템포 트랩은 폭탄으로 부수면 효과가 영구화된다.

> ⚠️ NecroDancer 위키(Fandom)는 접근이 차단돼(402) 적별 세부 규칙을 직접 확인하지 못했다. 아래 표에서 [기억]으로 표시한 항목은 내 사전 지식이라 검증이 필요하다.

| 적 | 규칙 | 우리 게임에서 쓸 포인트 |
|---|---|---|
| 그린 슬라임 [기억] | 제자리에서만 뜀 | 정적 장애물 |
| 블루 슬라임 [기억] | 2박마다 한 축으로 왕복 | 주기 2, 왕복 패턴 |
| 오렌지 슬라임 [기억] | 매 박 사각형 루프 | 고정 루프 → 빈틈 계산 |
| 스켈레톤 | 2박에 1번 추격 | 위상 차이로 "숨 쉴 틈" |
| 박쥐 [기억] | 무작위 이동 | ❌ 퍼즐에 부적합(비결정적) |
| 좀비 [기억] | 직진하다 벽에서 반전 | 결정적 순찰 |
| 미노타우르스/아르마딜로 [기억] | 일직선에 서면 돌진, 벽에 박으면 기절 | **유인 퍼즐**의 핵심 재료 |
| 고스트 [기억] | 플레이어가 다가가면 정지/투명, 멀어지면 접근 | 이동 방향이 적을 조종 |
| 미믹 [기억] | 상자로 위장, 접근하면 깨어남 | 숨은 정보(공정성 주의) |

### 1-2. Rift of the NecroDancer (2025)
- 3개 레인으로 적이 내려온다. 적마다 다르다: 2번 맞아야 죽는 블루 슬라임, 레인을 바꾸는 적, 맞으면 옆으로 피하는 적, 도망갔다 돌아오는 적.
- 박쥐: 바라보는 방향으로 1레인 이동 → 다시 맞으면 2레인 → 되돌아옴.
- 처치되면 **다른 적으로 변하는 적**, 그리고 **적의 이동을 바꾸는 함정**도 있다.

### 1-3. Rhythm Doctor
- 기본 규칙: **7번째 박에 스페이스**. 환자(레벨)마다 변형이 붙는다: 스윙, 무음 박, 홀드, 싱코페이션, 분할, 블라스트 비트, 여러 캐릭터 동시 진행.
- 중간에 박자가 바뀐다(8/8 → 7/8, 바이러스가 심장 일부를 떼어감).
- 시각 방해: 화면 글리치, 창이 모니터 위를 날아다님, **게임이 멈춘 척하기**.
- 후반부에 시각·청각 큐가 모두 사라져 **내부 메트로놈**에만 의존하게 하는 레벨도 있다.
- 설계 흐름: 처음엔 명확한 표시로 가르치고 → 표시를 걷어내고 → 방해 요소로 대체한다.

### 1-4. A Dance of Fire and Ice
- 타일 자체가 기믹이다. **트월(회전 방향 반전)**, **속도 변경 타일**, **홀드**.
- 커뮤니티 "저주 레벨" 변형: 속도 타일과 트월 타일을 맞바꾸기, 타일 각도에 따라 템포가 바뀜, 특정 방향으로 갈 때마다 홀드.
- 시사점: **"이 타일을 밟으면 규칙이 바뀐다"**는 그리드 게임에 바로 옮길 수 있다.

### 1-5. StepMania / DDR / IIDX 계열 (채보 기믹)
- **변속(소프란, ソフラン)**: BPM이 바뀌어 노트 속도가 변한다. IIDX의 한 곡이 중반에 BPM을 두 배로 올렸다 내리는 연출로 유명해져서 이 이름이 붙었다.
- **정지(Stop)**: 노트 스크롤이 멈춘다(DDR 5th부터).
- **가속/감속(Boost/Brake)**: 판정선에 가까워질수록 빨라지거나 느려진다.
- **Hidden / Sudden / Stealth**: 노트가 판정선 근처에서 사라지거나, 늦게 나타나거나, 아예 안 보인다.
- **Drunk / Drift**: 노트·판정선이 좌우로 흔들린다.
- **마인(지뢰)**: 치면 안 되는 노트. 한 열에 연속으로 깔린 "마인 홀드", 모든 열을 덮는 "마인 월".
- **페이크 노트**: 보이지만 판정이 없다. **역스크롤**: 노트가 반대로 흐른다.
- CHUNITHM WORLD'S END는 정지·변속·역주행을 아예 장르로 분류한다.

### 1-6. Phigros
- **판정선이 움직이고, 회전하고, 여러 개로 늘어나고, 화면을 뛰어다닌다.**
- 판정선을 숨겨서 "두 노트가 겹칠 때 쳐라" 같은 규칙을 만든다.
- 페이크 노트: 이펙트, 사운드, 점수 모두 없다.
- 커뮤니티 논쟁: **"보기 멋진 기믹"과 "시야를 막는 기믹"은 다르다.** 처음 보고 읽을 수 있느냐가 기준이다.

### 1-7. 기타
- **Beat Saber**: 폭탄(건드리면 안 됨), 벽(몸으로 피해야 함). 매핑 가이드는 폭탄을 "정밀함을 강제하거나 정적을 강조할 때만, 아껴서" 쓰라고 한다. 진짜처럼 보이지만 피해가 없는 **가짜 벽**도 있다.
- **DJMAX ECS**: 배경음과 연동된 노트. **치지 않으면 음악이 안 나온다.** → "행동해야 무언가가 활성화된다"로 응용할 수 있다.
- **Rhythm Heaven**: 콜 앤 리스폰스 구조(신호 → 정해진 박 뒤에 입력). 2박 큐와 4박 큐가 섞이고, 페이크아웃 큐, 갑자기 모든 큐가 사라지는 구간이 있다. 시각 연출은 일부러 플레이어를 박자에서 끌어낸다.
- **Hi-Fi Rush**: 적은 박에 맞춰 공격하고, 콜 앤 리스폰스로 예고한다. 강공격 전에는 **1박 더 길게 와인드업**한다.
- **Unbeatable**: 피해야 하는 노트, 여러 번 쳐야 하는 노트, 두 방향으로 갈라지는 레인.
- **GRIDbeat**: 어떤 적은 정박에 돌진하고, 어떤 적은 엇박에 미끄러진다.

---

## 2. 기믹 분류표 → 턴제 그리드 번역

| 축 | 리듬게임 원형 | RythmnEscape 번역안 |
|---|---|---|
| **타이밍** | N박에 1회 행동(스켈레톤) | 적마다 `주기 N` + `위상 k` (turn % N == k일 때 행동) |
| | 변속(소프란) | **템포 발판**: 밟으면 K턴 동안 적이 턴당 2회 행동(또는 0.5회) |
| | 정지(Stop) | **정지 발판/아이템**: 적 전체가 K턴 동안 멈춤 |
| | 스윙 | 적 행동 간격이 긴-짧-긴-짧 (2턴, 1턴 반복) |
| | 7번째 박 | **마디 규칙**: 8턴 마디의 7번째 턴에만 레이저·범위 공격 발동 |
| | 박자 변화(8→7) | 스테이지 중간에 마디 길이가 바뀜 |
| **공간** | 레인 변경 / 고정 루프 | 순찰 루프, 벽에서 반전하는 직진형 |
| | 돌진형(미노타우르스) | 일직선에 서면 돌진, 벽·적에 부딪히면 N턴 기절 → 유인 |
| | 바운스 트랩 | 밟으면 지정 방향으로 1~2칸 강제 이동 |
| | 판정선 이동(Phigros) | 맵 회전, 중력 방향 전환, 컨베이어 |
| **정보** | Hidden / Sudden | 적이 특정 거리 밖에서는 안 보임(어둠) |
| | 페이크 노트 / 가짜 벽 | 가짜 적(무해), 통과 가능한 가짜 벽 — 반드시 미세한 단서 제공 |
| | 미믹 | 상자·출구로 위장한 적 |
| | 무음 박 / 큐 소멸 | 특정 턴에 적 예고 UI가 꺼짐 → 앞 턴에서 기억해 둬야 함 |
| **규칙** | 혼란 트랩 / 트월 | 밟으면 K턴 동안 방향 입력 반전, 또는 적 회전 방향 반전 |
| | 홀드 | 특정 칸에서 N턴 머물러야 문이 열림 |
| | 다중 타격 | 적을 처치할 수 있다면: 2번 밟아야 죽는 적 |
| | 마인 / 폭탄 | 밟으면 안 되는 칸, 또는 특정 턴에만 위험한 칸 |
| | ECS(치지 않으면 무음) | 매 마디 특정 칸을 밟아 줘야 다리·불빛이 유지됨 |
| **상태** | 처치 시 변신(Rift) | 죽으면 다른 패턴의 적으로 변하는 적 |
| | 템포 트랩 영구화 | 발판을 부수거나 막으면 효과가 고정됨 |

---

## 3. 조사에서 뽑은 설계 원칙

1. **예고 + 결정론 = 퍼즐** (Into the Breach): 모든 적 행동이 미리 보이고 무작위가 없으면, 전투가 퍼즐이 된다. 플레이어는 죽어도 "내 판단 실수"로 받아들인다. → 박쥐 같은 **무작위 적은 빼거나, 시드 고정**.
2. **도전은 손가락이 아니라 머리에서** (Ryan Clark): 우리 게임은 턴제이므로 리듬은 **"턴의 시계"이자 연출**로 쓴다. 정확도 판정은 넣더라도 아주 관대하게.
3. **가르치기 → 걷어내기 → 비틀기** (Rhythm Doctor): 새 기믹은 안전한 방에서 먼저 보여 주고, 다음 방에서 조합하고, 그다음에 반전을 준다.
4. **캐치와 깨달음** (Game Maker's Toolkit, "What Makes a Good Puzzle?"): 좋은 퍼즐은 "모순처럼 보이는 상황(캐치)"이 있고, 이를 푸는 "깨달음"이 있다. 목표를 찾는 게 아니라 **목표에 가는 방법**을 찾는 게 도전이어야 한다.
5. **가리는 기믹은 신중하게** (Dan Lew, Phigros 논쟁, Beat Saber 가이드): 페이크, 미믹, 은신은 **추론할 수 있는 단서**가 있을 때만 공정하다. 폭탄처럼 아껴 쓸 것.
6. **같은 박에 움직이고 플레이어 우선** (NecroDancer 최종 설계): 플레이어 점프 → 즉시 판정 → 적 이동 순서를 명확히 하면 혼란이 적다.

---

## 4. 퍼즐 씨앗 (다음 단계에서 구체화할 후보)

1. **엇박 복도**: 주기 2인 경비 두 명이 위상이 엇갈려 있다. 둘 다 쉬는 턴은 없고, 번갈아 생기는 빈틈을 이어서 통과해야 한다.
2. **템포 발판 역이용**: 2배속 발판을 일부러 밟아 돌진형 적이 벽에 먼저 박게 만들고(기절), 그 틈에 지나간다.
3. **돌진 유인**: 돌진형 적과 일직선에 서서 일부러 돌진을 유도한다. 적은 문을 막는 다른 적에게 부딪혀 둘 다 기절한다.
4. **고스트 조종**: 고스트는 내가 다가가는 방향일 때 멈춘다. 뒤로 점프하면서 고스트를 원하는 칸으로 끌어당긴다(스위치 위로).
5. **7번째 박 레이저**: 8턴 마디의 7번째 턴에만 레이저가 켜진다. 경로 길이를 계산해서 7번째 턴에 안전지대에 있도록 우회한다.
6. **혼란 발판**: 3턴 동안 입력이 반전된다. 반전된 상태에서만 닿는 경로가 정답이다.
7. **무음 마디**: 한 마디 동안 적 예고 UI가 꺼진다. 앞 마디에서 패턴을 외워야 한다.

---

## 5. 다음 단계 전에 정해야 할 것 (기획 질문)

- **제자리 점프(대기)를 허용하나?** 허용 여부에 따라 퍼즐 난이도가 크게 달라진다. 대기가 없으면 위상 퍼즐이 훨씬 빡빡해진다.
- **적을 처치할 수 있나?** (다중 타격, 변신 기믹을 쓸지 결정)
- **실시간 박자 입력 요소가 있나, 아니면 순수 턴제인가?** (변속·정지를 "시간"으로 쓸지, "적 행동 횟수"로만 쓸지)
- **실패 조건**: 같은 칸, 공격 범위 외에 "적과 자리를 맞바꾸는 경우(교차)"도 실패로 볼지.

---

## 출처
- Crypt of the NecroDancer — https://en.wikipedia.org/wiki/Crypt_of_the_NecroDancer , https://zeldauniverse.net/guides/cadence-of-hyrule/strategy/what-is-crypt-of-the-necrodancer/
- Ryan Clark, Game Design Deep Dive — https://gamedeveloper.com/audio/game-design-deep-dive-finding-the-beat-in-i-crypt-of-the-necrodancer-i-
- NecroDancer 함정 공략(팬 사이트) — https://sites.google.com/view/warachiasouko/ホーム/necrodancer-english/traptile-strategies
- Cadence of Hyrule — https://mspoweruser.com/cadence-of-hyrule-has-a-fixed-beat-mode-for-those-who-lack-rhythm/ , https://www.dualshockers.com/cadence-of-hyrule-review-switch/
- Rift of the NecroDancer — https://en.wikipedia.org/wiki/Rift_of_the_NecroDancer , https://www.nintendolife.com/reviews/switch-eshop/rift-of-the-necrodancer
- Dan Lew, Obfuscated Rhythm Games — https://blog.danlew.net/2026/06/23/obfuscated-rhythm-games/
- Rhythm Doctor — https://www.pcgamer.com/au/rhythm-doctor-has-the-best-distraction-mechanics-ive-seen-in-any-rhythm-game , https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/RhythmDoctor
- ADOFAI 저주 레벨 목록 — https://sites.google.com/view/a-dance-of-fire-and-ice-curses/list-of-curse-series/carrot-curses
- StepMania 기믹 — https://github-wiki-see.page/m/RhythmLunatic/stepmania/wiki/Note-and-timing-gimmicks , https://www.flashflashrevolution.com/vbz/home/forum/gaming/stepmania/simulator-files/48074-my-guide-for-modded-courses , https://silentblue.remywiki.com/CHUNITHM:WORLD%27S_END
- 변속(소프란) — https://thewiki.kr/w/변속
- Phigros — https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Phigros
- Beat Saber 매핑 — https://bsmg.wiki/mapping/intermediate-mapping.html , https://bsmg.wiki/mapping/extended-mapping.html
- Rhythm Heaven — https://www.destructoid.com/reviews/review-rhythm-heaven-fever/
- Hi-Fi Rush — https://techraptor.net/gaming/reviews/hi-fi-rush-review
- GRIDbeat / 장르 사례 — https://www.yardbarker.com/video_games/articles/gridbeat_enchants_with_rhythmfueled_cyber_combat_to_the_dance_floor_of_a_digital_dungeon/s1_17456_43666786
- Into the Breach — https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-
- 퍼즐 설계(GMTK 요약) — https://www.kotaku.com.au/?p=863140 , https://notes.hamatti.org/gaming/puzzle-game-design
