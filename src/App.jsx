import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Track from "./pages/Track.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/track" element={<Track />} />
    </Routes>
  );
}