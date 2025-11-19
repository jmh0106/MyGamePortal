import { useState, useEffect } from 'react';
import { updateUserNickname, getUserStats } from '../firebase';
import './UserProfile.css'; // 스타일 파일 따로 만듦

// 티어 계산 함수 (재미 요소!)
const calculateTier = (score) => {
  if (score >= 1000) return { name: "LEGEND", color: "#ff0055" }; // 붉은색
  if (score >= 500) return { name: "DIAMOND", color: "#00f3ff" }; // 하늘색
  if (score >= 200) return { name: "GOLD", color: "#ffd700" };    // 금색
  if (score >= 50) return { name: "SILVER", color: "#c0c0c0" };   // 은색
  return { name: "BRONZE", color: "#cd7f32" };                    // 동색
};

function UserProfile({ user, onClose, onUpdateUser, showModal }) { // [추가] showModal prop
  const [nickname, setNickname] = useState(user.displayName || "");
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // 모달 열리면 점수 데이터 가져오기
  useEffect(() => {
    const fetchStats = async () => {
      if (user?.uid) {
        const data = await getUserStats(user.uid);
        setScores(data);
      }
      setLoading(false);
    };
    fetchStats();
  }, [user]);

  const handleSaveNickname = async () => {
    if (!nickname.trim()) return showModal("닉네임을 입력해주세요."); // [수정]
    const success = await updateUserNickname(user, nickname);
    if (success) {
      showModal("닉네임이 변경되었습니다!"); // [수정]
      onUpdateUser(); // App.jsx에 변경 알림 (화면 갱신)
      setIsEditing(false);
    }
  };

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>
        
        <h2 className="profile-title">AGENT PROFILE</h2>

        {/* 프로필 헤더 */}
        <div className="profile-header">
          <img src={user.photoURL} alt="Profile" className="profile-pic-large" />
          
          <div className="nickname-section">
            {isEditing ? (
              <div className="edit-box">
                <input 
                  type="text" 
                  value={nickname} 
                  onChange={(e) => setNickname(e.target.value)}
                  className="nickname-input"
                  maxLength={10}
                />
                <button className="save-btn" onClick={handleSaveNickname}>저장</button>
              </div>
            ) : (
              <div className="view-box">
                <h3 className="nickname-display">{user.displayName}</h3>
                <button className="edit-icon" onClick={() => setIsEditing(true)}>✎ 수정</button>
              </div>
            )}
            <p className="email-display">{user.email}</p>
          </div>
        </div>

        <hr className="divider" />

        {/* 게임 기록 (Stats) */}
        <div className="stats-section">
          <h3>BATTLE RECORDS</h3>
          
          {loading ? (
            <p>Loading data...</p>
          ) : (
            <div className="stats-grid">
              {/* 네온 러너 게임 카드 */}
              <div className="stat-card">
                <h4>Neon Runner</h4>
                <div className="score-info">
                  <span className="label">HIGH SCORE</span>
                  <span className="value">{scores["neon-runner"] || 0}</span>
                </div>
                <div className="tier-badge" style={{ 
                  borderColor: calculateTier(scores["neon-runner"] || 0).color,
                  color: calculateTier(scores["neon-runner"] || 0).color,
                  boxShadow: `0 0 10px ${calculateTier(scores["neon-runner"] || 0).color}`
                }}>
                  {calculateTier(scores["neon-runner"] || 0).name}
                </div>
              </div>
              
              {/* 나중에 게임 추가되면 여기에 카드 더 추가 */}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default UserProfile;