import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';

// Define global variables for Firebase configuration (provided by the Canvas environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'stube-cube-public-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const App = () => {
    const mountRef = useRef(null);
    const cubeGroupRef = useRef(new THREE.Group()); // Use a ref for the main cube group
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [score, setScore] = useState(0);
    const [startTime, setStartTime] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [message, setMessage] = useState('');

    // Firebase Initialization and Authentication
    useEffect(() => {
        if (!firebaseConfig) {
            console.error("Firebase config is not available. Cannot initialize Firebase.");
            setMessage("Error: Firebase configuration missing.");
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestore);
        setAuth(firebaseAuth);

        const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
                console.log("Firebase Auth: User signed in:", user.uid);
            } else {
                console.log("Firebase Auth: No user signed in. Attempting anonymous sign-in or custom token.");
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        console.log("Firebase Auth: Signed in with custom token.");
                    } else {
                        await signInAnonymously(firebaseAuth);
                        console.log("Firebase Auth: Signed in anonymously.");
                    }
                } catch (error) {
                    console.error("Firebase Auth Error:", error);
                    setMessage(`Authentication error: ${error.message}`);
                }
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // Firestore Leaderboard Listener
    useEffect(() => {
        if (db && isAuthReady) {
            const leaderboardCollectionRef = collection(db, `artifacts/${appId}/public/data/leaderboard`);
            // Note: orderBy is commented out to avoid potential index issues as per instructions.
            // Data will be sorted in memory.
            const q = query(leaderboardCollectionRef, limit(10));

            const unsubscribeLeaderboard = onSnapshot(q, (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Sort data in memory by score (descending)
                data.sort((a, b) => b.score - a.score);
                setLeaderboardData(data);
                console.log("Leaderboard data updated:", data);
            }, (error) => {
                console.error("Error fetching leaderboard:", error);
                setMessage(`Leaderboard error: ${error.message}`);
            });

            return () => unsubscribeLeaderboard();
        }
    }, [db, isAuthReady]);

    // Function to submit score
    const submitScore = async () => {
        if (!db || !userId || score === 0) {
            setMessage("Cannot submit score. Not authenticated or score is 0.");
            return;
        }
        try {
            const leaderboardCollectionRef = collection(db, `artifacts/${appId}/public/data/leaderboard`);
            await addDoc(leaderboardCollectionRef, {
                userId: userId,
                score: score,
                timestamp: serverTimestamp()
            });
            setMessage("Score submitted successfully!");
            console.log("Score submitted:", score);
        } catch (error) {
            console.error("Error submitting score:", error);
            setMessage(`Failed to submit score: ${error.message}`);
        }
    };

    // Game Logic Functions (Placeholder for actual game)
    const startGame = () => {
        setScore(0);
        setStartTime(Date.now());
        setIsPlaying(true);
        setMessage("Game started! Rotate the cube.");
    };

    const endGame = () => {
        setIsPlaying(false);
        setMessage(`Game Over! Your score: ${score}. Submit to leaderboard!`);
        // In a real game, score would be calculated based on game actions
        // For this demo, let's just set a dummy score based on time
        if (startTime) {
            const timeElapsed = Math.floor((Date.now() - startTime) / 1000); // seconds
            setScore(timeElapsed * 10); // Dummy score
        }
    };

    // Three.js Scene Setup and Animation
    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount) return;

        // Scene, Camera, Renderer
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha: true for transparent background
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        currentMount.appendChild(renderer.domElement);

        // Colors for the Stube Cube (Lemon Yellow, Lime Green, Baby Blue)
        const lemonYellow = new THREE.MeshPhongMaterial({ color: 0xFFF700 });
        const limeGreen = new THREE.MeshPhongMaterial({ color: 0x32CD32 });
        const babyBlue = new THREE.MeshPhongMaterial({ color: 0x89CFF0 });
        const black = new THREE.MeshPhongMaterial({ color: 0x1A1A1A }); // Dark gray for internal faces/gaps

        // Create the 3x3x3 cube
        const cubeSize = 1; // Size of each small cubelet
        const gap = 0.05; // Gap between cubelets
        const totalCubeDim = (cubeSize + gap) * 3 - gap; // Total dimension of the 3x3x3 cube
        const startPos = -totalCubeDim / 2 + cubeSize / 2;

        const cubelets = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

                    // Assign materials based on the Stube's 3-color scheme
                    // Assuming: Top/Bottom = Yellow, Front/Back = Green, Right/Left = Blue
                    const materials = [
                        babyBlue, // Right (+X)
                        babyBlue, // Left (-X)
                        lemonYellow, // Top (+Y)
                        lemonYellow, // Bottom (-Y)
                        limeGreen, // Front (+Z)
                        limeGreen   // Back (-Z)
                    ];

                    const cubelet = new THREE.Mesh(geometry, materials);
                    cubelet.position.set(
                        startPos + x * (cubeSize + gap),
                        startPos + y * (cubeSize + gap),
                        startPos + z * (cubeSize + gap)
                    );
                    cubelets.push(cubelet);
                    cubeGroupRef.current.add(cubelet);
                }
            }
        }
        scene.add(cubeGroupRef.current);

        // Position the camera
        camera.position.z = totalCubeDim * 1.5; // Adjust camera distance based on cube size
        camera.position.y = totalCubeDim * 0.5;
        camera.lookAt(0, 0, 0);

        // Add Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 2); // soft white light
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        // Handle window resize
        const handleResize = () => {
            if (currentMount) {
                camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);

        // Mouse/Touch Interaction for Rotation
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };

        const onMouseDown = (e) => {
            isDragging = true;
            previousMousePosition = { x: e.clientX || e.touches[0].clientX, y: e.clientY || e.touches[0].clientY };
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const clientX = e.clientX || e.touches[0].clientX;
            const clientY = e.clientY || e.touches[0].clientY;

            const deltaMove = {
                x: clientX - previousMousePosition.x,
                y: clientY - previousMousePosition.y
            };

            const rotationSpeed = 0.005;
            cubeGroupRef.current.rotation.y += deltaMove.x * rotationSpeed;
            cubeGroupRef.current.rotation.x += deltaMove.y * rotationSpeed;

            previousMousePosition = { x: clientX, y: clientY };
        };

        const onMouseUp = () => {
            isDragging = false;
        };

        currentMount.addEventListener('mousedown', onMouseDown);
        currentMount.addEventListener('mousemove', onMouseMove);
        currentMount.addEventListener('mouseup', onMouseUp);
        currentMount.addEventListener('mouseleave', onMouseUp); // Stop dragging if mouse leaves canvas

        currentMount.addEventListener('touchstart', onMouseDown);
        currentMount.addEventListener('touchmove', onMouseMove);
        currentMount.addEventListener('touchend', onMouseUp);

        // Cleanup on component unmount
        return () => {
            window.removeEventListener('resize', handleResize);
            currentMount.removeEventListener('mousedown', onMouseDown);
            currentMount.removeEventListener('mousemove', onMouseMove);
            currentMount.removeEventListener('mouseup', onMouseUp);
            currentMount.removeEventListener('mouseleave', onMouseUp);
            currentMount.removeEventListener('touchstart', onMouseDown);
            currentMount.removeEventListener('touchmove', onMouseMove);
            currentMount.removeEventListener('touchend', onMouseUp);
            currentMount.removeChild(renderer.domElement);
            renderer.dispose();
            geometry.dispose(); // Dispose geometries and materials if created directly
            materials.forEach(mat => mat.dispose()); // Dispose materials
            scene.clear(); // Clear the scene
        };
    }, []); // Empty dependency array means this runs once on mount

    return (
        <div className="min-h-screen bg-gray-900 text-white font-inter flex flex-col items-center p-4">
            <div className="w-full max-w-4xl bg-gray-800 rounded-lg shadow-lg p-6 flex flex-col md:flex-row gap-6">
                {/* Game Area */}
                <div className="flex-1 flex flex-col items-center justify-center">
                    <h1 className="text-4xl font-bold mb-4 text-center text-yellow-400">STUBE Cube</h1>
                    <p className="text-lg mb-4 text-center">Rotate the cube to explore its colors!</p>
                    <div
                        ref={mountRef}
                        className="w-full h-80 md:h-96 bg-gray-700 rounded-lg overflow-hidden mb-4 border-2 border-babyBlue"
                        style={{ touchAction: 'none' }} // Prevent default touch actions like scrolling/zooming
                    >
                        {/* Three.js canvas will be appended here */}
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-lg">Current Score: <span className="font-bold text-lime-400">{score}</span></p>
                        <p className="text-sm text-gray-400">User ID: <span className="font-mono text-xs break-all">{userId || 'Authenticating...'}</span></p>
                        <p className="text-sm text-gray-300">{message}</p>
                        <div className="flex gap-4 mt-2">
                            {!isPlaying ? (
                                <button
                                    onClick={startGame}
                                    className="px-6 py-3 bg-lime-500 hover:bg-lime-600 text-white font-semibold rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                                >
                                    Start Game (Demo)
                                </button>
                            ) : (
                                <button
                                    onClick={endGame}
                                    className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                                >
                                    End Game (Demo)
                                </button>
                            )}
                            <button
                                onClick={submitScore}
                                className="px-6 py-3 bg-babyBlue hover:bg-blue-400 text-white font-semibold rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                                disabled={!userId || score === 0 || isPlaying}
                            >
                                Submit Score
                            </button>
                        </div>
                    </div>
                </div>

                {/* Leaderboard */}
                <div className="flex-1 bg-gray-700 rounded-lg p-4 shadow-inner">
                    <h2 className="text-2xl font-bold mb-4 text-center text-yellow-400">Leaderboard</h2>
                    {leaderboardData.length === 0 ? (
                        <p className="text-gray-400 text-center">No scores yet. Be the first!</p>
                    ) : (
                        <ul className="space-y-2">
                            {leaderboardData.map((entry, index) => (
                                <li key={entry.id} className="flex justify-between items-center bg-gray-600 p-3 rounded-md shadow-sm">
                                    <span className="font-semibold text-lg text-lime-300">{index + 1}.</span>
                                    <span className="flex-1 ml-4 text-gray-200 break-all">{entry.userId}</span>
                                    <span className="font-bold text-xl text-yellow-300">{entry.score}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
