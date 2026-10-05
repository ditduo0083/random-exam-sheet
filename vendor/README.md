# 원본 고정

원본 커밋: `eb8e42670b3848bd901c0280d70a2340aa3b36aa`.
원본 경로: `kse-core-harness/lib/engine` 및 `kse-core-harness/lib/question`.
실행 코드만 복사했다. 원본의 앱·데이터 의존 시험 `engine.test.ts`는 제외한다.
원본 갱신 때 두 디렉터리의 실행 코드를 그대로 다시 복사하고 `npm run check-vendor`와 `npm test`로 해시·동등성을 확인한다.
5지선다는 사이트의 확장 타입과 검사로만 지원한다. 엔진·표준 타입·검사기는 변경하지 않는다.
