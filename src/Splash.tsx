import { useEffect, useState } from "react";
import './Splash.css'

export default function Splash() {
    const [show, setShow] = useState(true)
    useEffect(() => {
        const t = setTimeout(() => setShow(false), 500)
        return () => clearTimeout(t)
    }, [])
    if (!show) return null
    return (
        <div className="splash">
            <div className="card">
                <div className="logo">⚡</div>
                <div className="title">My PWA - AST</div>
            </div>
        </div>
    )
}