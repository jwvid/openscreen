# macOS 커스텀 빌드 설치

이 릴리스의 DMG는 Apple Silicon Mac(`arm64`)용입니다.

1. DMG를 열고 `Openscreen.app`을 `Applications` 폴더로 드래그합니다.
2. 터미널을 열어 다음 명령을 한 번 실행합니다.

   ```sh
   xattr -dr com.apple.quarantine /Applications/Openscreen.app
   ```

3. Openscreen을 실행하고 시스템 설정에서 요청되는 화면 기록, 손쉬운 사용,
   마이크, 카메라 권한을 허용합니다.

## 터미널 명령이 필요한 이유

이 커뮤니티 빌드는 Apple Developer ID 인증서가 없어 ad-hoc 방식으로 서명됐고
Apple 공증을 받지 않았습니다. 따라서 macOS가 다운로드한 앱의 최초 실행을 막을 수
있습니다. 이 저장소의 릴리스 페이지에서 받은 DMG만 설치하고, 공유할 때는 게시된
SHA-256 체크섬을 확인하세요.
