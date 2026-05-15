const [showJoke, setShowJoke] = useState(false);
const [currentJoke, setCurrentJoke] = useState("");
const [pulseSmile, setPulseSmile] = useState(false);
const jokeShownRef = useRef(false);

const jokes = [
  "Why do developers love coffee? Because Java ☕",
  "Your code works? Don’t touch it 😄",
  "Small breaks prevent big breakdowns 😊",
  "Debugging: Being the detective in a crime movie where you are also the criminal 😅",
  "Hydrate. Stretch. Smile. Repeat 💧"
];