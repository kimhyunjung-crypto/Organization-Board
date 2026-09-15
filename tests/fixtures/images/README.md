# 합성 인물 fixture

`synthetic-portrait.png`는 2026-09-15 내장 image_gen 도구로 생성한 가상 성인 인물이다. 실제 직원 사진이나 참조 이미지를 사용하지 않았다. S00.03의 얼굴 검출·좌표 시험에 사용하며, 한 인물에서 만든 변형만으로 실제 인물 집단에 대한 품질을 주장하지 않는다.

- SHA-256: `f76a136f71d66d453b4f23362d2c1c5c680fb115fe45aabddf6be157132e55b2`
- 생성 방식: built-in image_gen, 신규 생성.
- 원본을 변경하지 않고 테스트 코드에서 방향·배치·격자 fixture를 만든다.

## 생성 프롬프트

Create one photorealistic studio head-and-shoulders portrait of a completely fictional adult person, for a software face-detection test fixture. Straight-on front-facing view, both eyes clearly visible and looking at camera, neutral expression, unobstructed face, short dark hair, plain gray crew-neck shirt, no glasses or accessories. Full head with generous plain light gray background margins on every side and shoulders included, face centered. Uniform soft lighting, natural realistic facial features. Square composition 1024x1024. No text, logos, labels, borders, watermark, or real-person reference.
