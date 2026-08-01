# task_completion

코드를 건드렸으면 아래를 **실행한 뒤** 완료를 말한다. 실행한 명령과 결과를 그대로 보고한다.

```
npx tsc --noEmit
npx eslint . --max-warnings=0
npm test
npx next build
```

## 통과 기준

- tsc 0, eslint 0(경고 포함), vitest 전건 통과.
- `next build` 성공 + **홈 First Load JS 295 kB 이하**(현재 283 kB). 빌드 출력의 라우트 표로 확인.

## 추가 확인

- **미사용 import·변수는 ESLint가 잡지 않는다.** 심볼을 옮기거나 지운 뒤에는
  `find_referencing_symbols`로 직접 확인하거나 참조 수를 세어 본다.
- 폭·치수를 바꿨으면 `shell/constants.ts` 밖에 숫자가 남지 않았는지 확인.
- UI를 바꿨으면 브라우저 실물 확인은 **사용자 몫**이다. 하지 않았으면 "미검증"이라고 명시한다.
- 문서 작업의 검증은 참조 경로 실존 확인이 대신한다.

## 실패 시

1회 수정 후 재실행. 그래도 실패하면 중단하고 보고한다. 수정 루프를 반복하지 않는다.
