"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { currentUser, getToken } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { Avatar, Button } from "@/components/product/primitives";

const pairs = [{ symbol: "ETH", label: "Native" }, { symbol: "NVDA", label: "Stock Pair" }, { symbol: "TSLA", label: "Stock Pair" }, { symbol: "AAPL", label: "Stock Pair" }];
const checkStates = ["Checking pair", "Reading economics", "Simulating", "Ready"];

export function LaunchStudio() {
  const [name, setName] = useState("Side");
  const [ticker, setTicker] = useState("SIDE");
  const [description, setDescription] = useState("A market for the ideas moving beside the crowd.");
  const [pair, setPair] = useState("ETH");
  const [devBuy, setDevBuy] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [statusIndex, setStatusIndex] = useState(-1);
  const [success, setSuccess] = useState(false);
  const [shared, setShared] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function simulateLaunch() {
    if (statusIndex >= 0) return;
    setStatusIndex(0);
    checkStates.slice(1).forEach((_, index) => timers.current.push(setTimeout(() => setStatusIndex(index + 1), (index + 1) * 520)));
    timers.current.push(setTimeout(() => setSuccess(true), 2350));
  }

  const cleanTicker = ticker.trim().toUpperCase() || "TOKEN";
  const cleanName = name.trim() || "Untitled token";
  const demoToken = getToken("side");
  return (
    <section className="ps-view ps-launch-view">
      <header className="ps-page-header"><div><span className="ps-eyebrow">Create a market</span><h1>Launch</h1></div><span className="ps-demo-badge">UI prototype</span></header>
      <div className="ps-launch-studio">
        <form className="ps-launch-form" onSubmit={(event) => { event.preventDefault(); simulateLaunch(); }}>
          <div className="ps-form-intro"><span>01</span><div><h2>Token details</h2><p>Give the community something clear to gather around.</p></div></div>
          <label className="ps-upload-field"><input type="file" accept="image/*" /><span><Icon name="image" /></span><div><strong>Token image</strong><small>Local preview only · PNG or JPG</small></div><em>Choose</em></label>
          <div className="ps-field-grid"><label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" /></label><label><span>Ticker</span><input value={ticker} onChange={(event) => setTicker(event.target.value.slice(0, 8))} placeholder="SIDE" /></label></div>
          <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What is this market about?" /></label>
          <div className="ps-field-grid ps-social-fields"><label><span>X</span><input placeholder="x.com/handle" /></label><label><span>Website</span><input placeholder="https://" /></label></div>
          <label><span>Telegram</span><input placeholder="t.me/community" /></label>
          <div className="ps-form-intro ps-form-step"><span>02</span><div><h2>Market setup</h2><p>Demo pairs illustrate the selector only.</p></div></div>
          <fieldset className="ps-pair-selector"><legend>Pair</legend>{pairs.map((item) => <label key={item.symbol} className={pair === item.symbol ? "is-active" : ""}><input type="radio" name="pair" value={item.symbol} checked={pair === item.symbol} onChange={() => setPair(item.symbol)} /><span>{item.symbol.slice(0, 2)}</span><strong>{item.symbol}<small>{item.label}</small></strong>{pair === item.symbol && <Icon name="check" />}</label>)}</fieldset>
          <label><span>Developer Buy <em>Optional</em></span><div className="ps-amount-input"><input inputMode="decimal" value={devBuy} onChange={(event) => setDevBuy(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" /><strong>{pair}</strong></div><small>Leave empty to launch without a developer buy.</small></label>
          <div className="ps-advanced"><button type="button" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}><span><strong>Advanced settings</strong><small>Creator tax and buyback</small></span><Icon name="chevron" className={advanced ? "is-open" : ""} /></button>{advanced && <div className="ps-advanced-grid"><label><span>Creator Tax</span><select defaultValue="1"><option value="0">0%</option><option value="1">1%</option><option value="2">2%</option></select></label><label><span>Buyback</span><select defaultValue="auto"><option value="auto">Automatic</option><option value="off">Off</option></select></label></div>}</div>
        </form>
        <aside className="ps-launch-preview"><div className="ps-preview-window"><header><span>Live preview</span><em>Demo</em></header><div className="ps-preview-token"><span>{cleanTicker.slice(0,2)}</span><div><h2>{cleanName}</h2><p>${cleanTicker}</p></div><i /></div><p className="ps-preview-description">{description || "Your token description will appear here."}</p><dl><div><dt>Pair</dt><dd>{pair}<small>{pair === "ETH" ? "Native" : "Stock Pair"}</small></dd></div><div><dt>Creator</dt><dd>@{currentUser.handle}</dd></div><div><dt>Developer Buy</dt><dd>{devBuy ? `${devBuy} ${pair}` : "None"}</dd></div></dl><div className="ps-preview-social"><span>X</span><span>Website</span><span>Telegram</span></div>{statusIndex >= 0 && !success && <div className="ps-launch-progress">{checkStates.map((step, index) => <span key={step} className={index < statusIndex ? "is-done" : index === statusIndex ? "is-current" : ""}><i>{index < statusIndex ? <Icon name="check" /> : index + 1}</i>{step}</span>)}</div>}<Button type="button" onClick={simulateLaunch} disabled={statusIndex >= 0}>{statusIndex >= 0 ? checkStates[statusIndex] ?? "Ready" : `Launch ${cleanTicker}`}</Button><small className="ps-preview-note">Frontend demonstration only. No transaction will be sent.</small></div></aside>
      </div>
      {success && <div className="ps-modal-backdrop"><section className="ps-success-modal" role="dialog" aria-modal="true" aria-labelledby="launch-success"><button className="ps-icon-button" type="button" onClick={() => setSuccess(false)} aria-label="Close"><Icon name="close" /></button><span className="ps-success-icon"><Icon name="check" /></span><small>Demo launch complete</small><h2 id="launch-success">{cleanTicker} is live</h2><p>0x4de7…7890</p><div><Link className="ps-button ps-button-primary" href={`/app/token/${demoToken.address}`}>View token</Link><Button tone="secondary" type="button" icon={<Icon name={shared ? "check" : "share"} />} onClick={() => setShared(true)}>{shared ? "Copied" : "Share"}</Button></div><article className="ps-auto-post"><Avatar user={currentUser} size="sm" /><span><strong>@{currentUser.handle} launched ${cleanTicker}</strong><small>{pair} · Live · Auto social activity preview</small></span><i /></article></section></div>}
    </section>
  );
}
