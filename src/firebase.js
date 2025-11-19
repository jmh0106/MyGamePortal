import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, updateProfile } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); // [추가] 데이터베이스 초기화
export const googleProvider = new GoogleAuthProvider();

// 로그인
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    // 로그인 시 DB에 유저 문서가 없으면 기본값 생성 (점수 0)
    const userRef = doc(db, "users", result.user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        highScores: { "neon-runner": 0 } // 게임 ID별 점수 저장
      }, { merge: true });
    }
    return result.user;
  } catch (error) {
    console.error("Login Failed:", error);
    return null;
  }
};

// 로그아웃
export const logout = async () => {
  await signOut(auth);
};

// [추가] 닉네임 변경 함수
export const updateUserNickname = async (user, newName) => {
  try {
    await updateProfile(user, { displayName: newName });
    return true;
  } catch (error) {
    console.error("닉네임 변경 실패:", error);
    return false;
  }
};

// [추가] 유저 점수 데이터 가져오기
export const getUserStats = async (uid) => {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data().highScores || {};
    }
    return {};
  } catch (error) {
    console.error("데이터 로드 실패:", error);
    return {};
  }
};

export const saveHighScore = async (user, gameId, newScore) => {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  
  try {
    // 1. 현재 저장된 점수 가져오기
    const userSnap = await getDoc(userRef);
    let currentData = userSnap.exists() ? userSnap.data() : {};
    let highScores = currentData.highScores || {};
    let oldScore = highScores[gameId] || 0;

    // 2. 신기록일 때만 저장!
    if (newScore > oldScore) {
      highScores[gameId] = newScore;
      
      // 유저 정보에 최고 점수 업데이트 (닉네임도 같이 저장해두면 랭킹 볼 때 편함)
      await setDoc(userRef, {
        displayName: user.displayName, // 랭킹 표시용
        photoURL: user.photoURL,       // 랭킹 표시용
        highScores: highScores
      }, { merge: true });
      
      console.log("🎉 신기록 달성! 저장 완료:", newScore);
      return true; // 신기록임
    } else {
      console.log("기존 기록이 더 높습니다. 저장 안 함.");
      return false; // 신기록 아님
    }
  } catch (error) {
    console.error("점수 저장 실패:", error);
  }
};

// [추가] 리더보드 데이터 가져오기 (TOP 10)
export const getLeaderboard = async (gameId) => {
  try {
    const usersRef = collection(db, "users");
    
    // 쿼리: 해당 게임 점수(highScores.게임ID) 내림차순(desc)으로 정렬하고 10개만 제한(limit)
    const q = query(
      usersRef, 
      orderBy(`highScores.${gameId}`, "desc"), 
      limit(10)
    );

    const querySnapshot = await getDocs(q);
    
    const leaderboard = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // 점수가 있는 유저만 추가
      if (data.highScores && data.highScores[gameId] !== undefined) {
        leaderboard.push({
          uid: doc.id,
          name: data.displayName || "Unknown",
          score: data.highScores[gameId],
          photo: data.photoURL
        });
      }
    });
    
    return leaderboard;
  } catch (error) {
    console.error("리더보드 로딩 실패:", error);
    // [중요] 색인 에러가 날 경우를 대비해 빈 배열 반환
    return [];
  }
};