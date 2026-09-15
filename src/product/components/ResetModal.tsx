export interface ResetModalProps {
  readonly isOpen: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ResetModal({ isOpen, onCancel, onConfirm }: ResetModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
      <div className="modal-content reset-modal">
        <div className="modal-header">
          <span className="modal-icon warning-icon" aria-hidden="true">⚠️</span>
          <h2 id="reset-modal-title">현재 작업 초기화</h2>
        </div>
        <div className="modal-body">
          <p>
            현재까지 입력한 <strong>직원 정보</strong>, 업로드한 <strong>사진 파일</strong>,{" "}
            <strong>매칭 및 사진 편집 결과</strong>가 모두 메모리에서 삭제됩니다.
          </p>
          <p className="danger-note">
            이 작업은 복구할 수 없습니다. 정말로 처음부터 다시 시작하시겠습니까?
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            모두 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
