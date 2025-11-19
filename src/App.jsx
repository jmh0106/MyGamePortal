import { useState, useMemo, useEffect } from 'react';
import gameList from './data/gameList.json';
import './App.css';
// [수정] 중복 제거하고 한 줄로 통합했습니다.
import { loginWithGoogle, logout, auth, saveHighScore, getLeaderboard } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import UserProfile from './components/UserProfile';
import Modal from './components/Modal'; // [추가] 모달 컴포넌트

function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  const [filter, setFilter] = useState("All");
  const [user, setUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [modal, setModal] = useState({ show: false, message: '' }); // [추가] 모달 상태

  // [추가] 모달을 닫는 함수
  const closeModal = () => setModal({ show: false, message: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // [추가] 게임 메시지 리스너 (점수 저장용)
  useEffect(() => {
    const handleGameMessage = async (event) => {
      if (event.data.type === 'GAME_OVER') {
        const { gameId, score } = event.data;
        console.log(`🎮 게임 종료! 점수 수신: ${score}점 (게임: ${gameId})`);

        if (user) {
          const isNewRecord = await saveHighScore(user, gameId, score);
          if (isNewRecord) {
            // [수정] alert 대신 모달 사용
            setModal({ show: true, message: `🎉 축하합니다! ${selectedGame.title} 신기록 달성: ${score}점` });
            // 필요하다면 여기서 유저 상태를 업데이트하거나 프로필을 열어줄 수 있습니다.
          }
        }
      }

      if (event.data.type === 'REQUEST_LEADERBOARD') {
        console.log("📜 게임에서 리더보드 요청함...");
        const { gameId } = event.data;
        
        // Firebase에서 데이터 가져오기
        const data = await getLeaderboard(gameId);
        
        // 게임(iframe)에게 데이터 던져주기
        // event.source는 메시지를 보낸 그 iframe 윈도우입니다.
        event.source.postMessage({
          type: 'LEADERBOARD_DATA',
          data: data
        }, '*');
      }
    };

    window.addEventListener('message', handleGameMessage);
    return () => window.removeEventListener('message', handleGameMessage);
  }, [user, selectedGame]); // user나 게임이 바뀌면 리스너 갱신


  const handleLogin = async () => {
    const user = await loginWithGoogle();
    // [수정] alert 대신 모달 사용
    if (user) setModal({ show: true, message: `환영합니다, ${user.displayName}님!` });
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleUserUpdate = () => {
    setUser({ ...auth.currentUser });
  };

  const allTags = useMemo(() => {
    const tags = new Set(gameList.flatMap(game => game.tags));
    return ["All", ...tags];
  }, []);

  const filteredGames = filter === "All" 
    ? gameList 
    : gameList.filter(game => game.tags.includes(filter));

  return (
    <>
      {/* [추가] 모달 렌더링 */}
      {modal.show && <Modal message={modal.message} onClose={closeModal} />}

      {showProfile && user && (
        <UserProfile 
          user={user} 
          onClose={() => setShowProfile(false)} 
          onUpdateUser={handleUserUpdate}
          showModal={(message) => setModal({ show: true, message })}
        />
      )}

      <div className="app-container">
      
      {selectedGame ? (
        <div className="game-player-overlay">
          <div className="player-header">
            <button className="back-btn" onClick={() => setSelectedGame(null)}>
              ✕ 닫기
            </button>
            <h2>{selectedGame.title}</h2>
          </div>
          <div className="iframe-wrapper">
            <iframe src={selectedGame.path} title={selectedGame.title} />
          </div>
        </div>
      ) : (
        <>
          {/* [1] 최상단 글로벌 네비게이션 */}
          <nav className="global-nav">
            <div className="nav-brand">MY ARCADE</div>
            
            <ul className="nav-links">
              <li><a href="#">홈</a></li>
              <li><a href="#">소개</a></li>
            </ul>

            <div className="nav-auth">
              {user ? (
                <div className="user-info">
                  <span className="user-name">{user.displayName}</span>
                  <img 
                    src={user.photoURL} 
                    alt="User" 
                    className="user-profile-pic" 
                    onClick={() => setShowProfile(true)} 
                    style={{cursor: 'pointer'}}
                  />
                  <button className="auth-btn logout" onClick={handleLogout}>로그아웃</button>
                </div>
              ) : (
                <button className="auth-btn login" onClick={handleLogin}>
                  Google 로그인
                </button>
              )}
            </div>
          </nav>

          {/* [2] 히어로 섹션 */}
          <header className="hero-section">
            <h1 className="main-title">Game Portal</h1>
            <p className="sub-title">Play Game, Just for Fun!</p>
          </header>

          {/* [3] 태그 네비게이션 */}
          <nav className="tag-nav">
            <div className="tag-container">
              {allTags.map(tag => (
                <button 
                  key={tag} 
                  className={`tag-btn ${filter === tag ? 'active' : ''}`}
                  onClick={() => setFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </nav>

          {/* [4] 게임 목록 */}
          <main className="game-list-section">
            <div className="game-grid">
              {filteredGames.map((game) => (
                <div key={game.id} className="game-card" onClick={() => {
                  if(game.path) setSelectedGame(game);
                  // [수정] alert 대신 모달 사용
                  else setModal({ show: true, message: "준비중!" });
                }}>
                  <div className="image-frame">
                    <img src={game.thumbnail} alt={game.title} />
                  </div>
                  <div className="card-info">
                    <h3>{game.title}</h3>
                    <div className="card-tags">
                      {game.tags.map(t => <span key={t}>#{t}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </>
      )}
      </div>
    </>
  );
}

export default App;