# 합성 인물 및 EXIF fixture

`synthetic-portrait.png`는 2026-09-15 내장 image_gen 도구로 생성한 가상 성인 인물이다. 실제 직원 사진이나 참조 이미지를 사용하지 않았다. S00.03의 얼굴 검출·좌표 시험에 사용하며, 한 인물에서 만든 변형만으로 실제 인물 집단에 대한 품질을 주장하지 않는다.

- SHA-256: `f76a136f71d66d453b4f23362d2c1c5c680fb115fe45aabddf6be157132e55b2`
- 크기: 1254 × 1254 px (2,073,040 bytes)
- 생성 방식: built-in image_gen, 신규 생성.
- 원본을 변경하지 않고 테스트 코드에서 방향·배치·격자 fixture를 만든다.

## 생성 프롬프트

Create one photorealistic studio head-and-shoulders portrait of a completely fictional adult person, for a software face-detection test fixture. Straight-on front-facing view, both eyes clearly visible and looking at camera, neutral expression, unobstructed face, short dark hair, plain gray crew-neck shirt, no glasses or accessories. Full head with generous plain light gray background margins on every side and shoulders included, face centered. Uniform soft lighting, natural realistic facial features. Square composition 1024x1024. No text, logos, labels, borders, watermark, or real-person reference.

## EXIF 1~8 실제 JPEG 방향 fixture

TRD §7.1 요구사항에 따라 mock 디코더가 아닌 실제 JPEG APP1 EXIF orientation 태그(1~8)를 포함하는 실제 이미지 fixture를 생성하였다. 모든 fixture는 정방향(upright) 600 × 500px 구도를 기준으로 카메라 회전 센서 상태를 역변환한 원시 픽셀에 TIFF Orientation 태그를 부여하여, EXIF-aware 디코더에서 동일한 정방향 얼굴 검출이 이루어짐을 검증한다.

- `exif-1.jpg`: Orientation 1 (Normal 0°), 600 × 500 px
  - SHA-256: `c81c47cfa742030fd293eb2571974e18a069caf51b4ffb6e177610b841765c17`
- `exif-2.jpg`: Orientation 2 (Mirror Horizontal), 600 × 500 px
  - SHA-256: `a0add21c8d24b595feac98ad7b4079bee6e5161d76594a60adfa930a6b107aa7`
- `exif-3.jpg`: Orientation 3 (Rotate 180°), 600 × 500 px
  - SHA-256: `0a58699290d30c0b284840c3eca434b62cf4b159bd2f8874af6c627d0e37acd3`
- `exif-4.jpg`: Orientation 4 (Mirror Vertical), 600 × 500 px
  - SHA-256: `72052f5c04caa707c48558b0fc9028bd9806ce8874bacac81a32a84105100776`
- `exif-5.jpg`: Orientation 5 (Mirror H + Rotate 270° CW / Transpose), 500 × 600 px raw
  - SHA-256: `c887e6621afa1999175e5fe379c5c9de6c6d31f2d31c603251817bc6aae9dad8`
- `exif-6.jpg`: Orientation 6 (Rotate 90° CW), 500 × 600 px raw
  - SHA-256: `9f0e584a19c681a4a11dc805b2f1e269123593f4e3278ec53ed446aac2b6fa16`
- `exif-7.jpg`: Orientation 7 (Mirror H + Rotate 90° CW / Transverse), 500 × 600 px raw
  - SHA-256: `ffa6881fd502aacae4b333e9f86412d066f7dbffa600fde76f716ecf7e59dc27`
- `exif-8.jpg`: Orientation 8 (Rotate 270° CW / 90° CCW), 500 × 600 px raw
  - SHA-256: `b291966381f7da489ea4c40fd7204f2f7895b1256ccc8b7e5975ec83cd95d4e1`
