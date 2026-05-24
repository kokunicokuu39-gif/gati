import { useState, useMemo } from "react";

const STATUS_COLOR = { "○": "#4caf7d", "△": "#f59e0b", "×": "#ef4444", "発注中": "#6366f1" };
const DEFAULT_OFFICES = [
  { id: "o1", name: "第1事業所" }, { id: "o2", name: "第2事業所" },
  { id: "o3", name: "第3事業所" }, { id: "o4", name: "第4事業所" }, { id: "o5", name: "第5事業所" },
];

function uid() { return Math.random().toString(36).slice(2, 10); }
function today() { return new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }); }

function loadState() { try { const s = localStorage.getItem("supplies_v5"); if (s) return JSON.parse(s); } catch {} return null; }
function saveState(s) { try { localStorage.setItem("supplies_v5", JSON.stringify(s)); } catch {} }
function initState() {
  const saved = loadState();
  if (saved) return saved;
  const offices = DEFAULT_OFFICES.map(o => ({ ...o }));
  const items = {}; offices.forEach(o => { items[o.id] = []; });
  return { offices, items, orders: [], orderHistory: [], quantities: {} };
}

export default function App() {
  const [state, setStateRaw] = useState(initState);
  const [tab, setTab] = useState("office");
  const [selectedOffice, setSelectedOffice] = useState(() => initState().offices[0]?.id || null);
  const [modal, setModal] = useState(null);

  function setState(updater) {
    setStateRaw(prev => { const next = typeof updater === "function" ? updater(prev) : updater; saveState(next); return next; });
  }

  function setQuantity(officeId, itemId, value) {
    const key = `${officeId}_${itemId}`;
    setState(p => ({ ...p, quantities: { ...p.quantities, [key]: value } }));
  }
  function getQuantity(officeId, itemId) { return state.quantities[`${officeId}_${itemId}`] || ""; }

  function addOffice(name) { const id = uid(); setState(p => ({ ...p, offices: [...p.offices, { id, name }], items: { ...p.items, [id]: [] } })); }
  function renameOffice(id, name) { setState(p => ({ ...p, offices: p.offices.map(o => o.id === id ? { ...o, name } : o) })); }
  function deleteOffice(id) {
    setModal({ type: "confirmDelete", message: "この事業所を削除しますか？（物品データもすべて削除されます）", onConfirm: () => {
      setState(p => { const offices = p.offices.filter(o => o.id !== id); const items = { ...p.items }; delete items[id]; return { ...p, offices, items }; });
      if (selectedOffice === id) setSelectedOffice(state.offices.find(o => o.id !== id)?.id || null);
      setModal(null);
    }});
  }

  function updateItem(officeId, itemId, patch) {
    setState(p => ({ ...p, items: { ...p.items, [officeId]: (p.items[officeId] || []).map(i => i.id === itemId ? { ...i, ...patch, updatedAt: today() } : i) } }));
  }
  function addItem(officeId, name, threshold) {
    setState(p => ({ ...p, items: { ...p.items, [officeId]: [...(p.items[officeId] || []), { id: uid(), name, status: "○", threshold: threshold || "", updatedAt: today() }] } }));
  }
  function deleteItem(officeId, itemId) {
    setModal({ type: "confirmDelete", message: "この物品を削除しますか？", onConfirm: () => {
      setState(p => ({ ...p, items: { ...p.items, [officeId]: (p.items[officeId] || []).filter(i => i.id !== itemId) } }));
      setModal(null);
    }});
  }

  function placeOrder(officeId, itemId, itemName, person, note, orderType = "normal", quantity = "") {
    const order = { id: uid(), type: orderType, officeId, itemId: itemId || null, itemName, person, note, quantity, status: orderType === "extra" ? "pending" : "ordered", orderedAt: today(), arrivedAt: null };
    setState(p => {
      const items = itemId ? { ...p.items, [officeId]: (p.items[officeId] || []).map(i => i.id === itemId ? { ...i, status: "発注中", updatedAt: today() } : i) } : p.items;
      return { ...p, items, orders: [...p.orders, order], orderHistory: [...p.orderHistory, order] };
    });
  }
  function approveExtra(orderId, person, note) {
    setState(p => {
      const order = p.orders.find(o => o.id === orderId); if (!order) return p;
      const updated = { ...order, status: "ordered", person: person || order.person, note: note || order.note, orderedAt: today() };
      return { ...p, orders: p.orders.map(o => o.id === orderId ? updated : o), orderHistory: p.orderHistory.map(o => o.id === orderId ? updated : o) };
    });
  }
  function markArrived(orderId) {
    setState(p => {
      const order = p.orders.find(o => o.id === orderId); if (!order) return p;
      const updated = { ...order, status: "arrived", arrivedAt: today() };
      let items = p.items;
      if (order.itemId) items = { ...items, [order.officeId]: (items[order.officeId] || []).map(i => i.id === order.itemId ? { ...i, status: "○", updatedAt: today() } : i) };
      return { ...p, orders: p.orders.filter(o => o.id !== orderId), orderHistory: p.orderHistory.map(o => o.id === orderId ? updated : o), items };
    });
  }
  function deleteHistory(orderId) { setState(p => ({ ...p, orderHistory: p.orderHistory.filter(o => o.id !== orderId) })); }

  const summaryLow = useMemo(() => {
    const map = {};
    state.offices.forEach(o => { (state.items[o.id] || []).forEach(item => { if (item.status === "△") { if (!map[item.name]) map[item.name] = []; map[item.name].push({ officeId: o.id, officeName: o.name, status: item.status, itemId: item.id }); } }); });
    return map;
  }, [state]);
  const summaryNG = useMemo(() => {
    const map = {};
    state.offices.forEach(o => { (state.items[o.id] || []).forEach(item => { if (item.status === "×" || item.status === "発注中") { if (!map[item.name]) map[item.name] = []; map[item.name].push({ officeId: o.id, officeName: o.name, status: item.status, itemId: item.id }); } }); });
    return map;
  }, [state]);

  const office = state.offices.find(o => o.id === selectedOffice);
  const officeItems = state.items[selectedOffice] || [];

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.headerInner}>
          <span style={S.logo}>📦 消耗品管理</span>
          <div style={S.tabBar}>
            {[["office","事業所"],["order","発注"]].map(([key, label]) => (
              <button key={key} style={{ ...S.tabBtn, ...(tab === key ? S.tabActive : {}) }} onClick={() => setTab(key)}>
                {label}{key === "order" && state.orders.length > 0 && <span style={S.badge}>{state.orders.length}</span>}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main style={S.main}>
        {tab === "office" && (
          <OfficeTab state={state} selectedOffice={selectedOffice} setSelectedOffice={setSelectedOffice}
            office={office} officeItems={officeItems} summaryLow={summaryLow} summaryNG={summaryNG}
            onAddOffice={() => setModal({ type: "addOffice" })}
            onRenameOffice={id => setModal({ type: "renameOffice", officeId: id, current: state.offices.find(o=>o.id===id)?.name || "" })}
            onDeleteOffice={deleteOffice}
            onAddItem={officeId => setModal({ type: "addItem", officeId })}
            onRenameItem={(oid, iid) => setModal({ type: "renameItem", officeId: oid, itemId: iid, current: state.items[oid]?.find(i=>i.id===iid)?.name || "" })}
            onDeleteItem={deleteItem}
            onSetStatus={(oid, iid, st) => updateItem(oid, iid, { status: st })}
            onSetThreshold={(oid, iid) => setModal({ type: "setThreshold", officeId: oid, itemId: iid, current: state.items[oid]?.find(i=>i.id===iid)?.threshold || "" })}
          />
        )}
        {tab === "order" && (
          <OrderTab state={state} summaryLow={summaryLow} summaryNG={summaryNG} offices={state.offices}
            markArrived={markArrived} approveExtra={approveExtra} deleteHistory={deleteHistory}
            onAddIrregular={() => setModal({ type: "irregular" })}
            onPlaceOrder={(officeId, itemId, itemName, quantity) => setModal({ type: "placeOrder", officeId, itemId, itemName, quantity: quantity || "", orderType: "normal" })}
            getQuantity={getQuantity} setQuantity={setQuantity}
          />
        )}
      </main>
      {modal && <ModalDispatch modal={modal} setModal={setModal} state={state} addOffice={addOffice} renameOffice={renameOffice} addItem={addItem} updateItem={updateItem} placeOrder={placeOrder} approveExtra={approveExtra} />}
    </div>
  );
}

function ModalDispatch({ modal, setModal, state, addOffice, renameOffice, addItem, updateItem, placeOrder }) {
  function close() { setModal(null); }
  if (modal.type === "confirmDelete") return (
    <Overlay><BottomSheet>
      <p style={{ fontSize: 15, color: "#222", margin: "0 0 20px" }}>{modal.message}</p>
      <div style={S.modalBtns}><button style={S.cancelBtn} onClick={close}>キャンセル</button><button style={{ ...S.submitBtn, background: "#ef4444" }} onClick={modal.onConfirm}>削除する</button></div>
    </BottomSheet></Overlay>
  );
  if (modal.type === "addOffice") return <TextInputModal title="事業所を追加" fields={[{ key: "name", label: "事業所名", placeholder: "例：第6事業所" }]} onSubmit={v => { if (v.name?.trim()) { addOffice(v.name.trim()); close(); } }} onClose={close} />;
  if (modal.type === "renameOffice") return <TextInputModal title="事業所名を変更" fields={[{ key: "name", label: "新しい事業所名", placeholder: "", initial: modal.current }]} onSubmit={v => { if (v.name?.trim()) { renameOffice(modal.officeId, v.name.trim()); close(); } }} onClose={close} />;
  if (modal.type === "addItem") return <TextInputModal title="物品を追加" fields={[{ key: "name", label: "物品名", placeholder: "例：コピー用紙" }, { key: "threshold", label: "△の基準（任意）", placeholder: "例：残り2箱" }]} onSubmit={v => { if (v.name?.trim()) { addItem(modal.officeId, v.name.trim(), v.threshold?.trim() || ""); close(); } }} onClose={close} />;
  if (modal.type === "renameItem") return <TextInputModal title="物品名を変更" fields={[{ key: "name", label: "新しい物品名", placeholder: "", initial: modal.current }]} onSubmit={v => { if (v.name?.trim()) { updateItem(modal.officeId, modal.itemId, { name: v.name.trim() }); close(); } }} onClose={close} />;
  if (modal.type === "setThreshold") return <TextInputModal title="△の基準を設定" fields={[{ key: "threshold", label: "△の基準（個数・本数など）", placeholder: "例：残り2箱", initial: modal.current }]} onSubmit={v => { updateItem(modal.officeId, modal.itemId, { threshold: v.threshold?.trim() || "" }); close(); }} onClose={close} />;
  if (modal.type === "placeOrder") return <TextInputModal title="発注登録" submitLabel="発注する"
    fields={[{ key: "person", label: "発注担当者名", placeholder: "担当者名を入力" }, { key: "quantity", label: "発注数量", placeholder: "例：3箱、10本", initial: modal.quantity || "" }, { key: "note", label: "備考（任意）", placeholder: "" }]}
    onSubmit={v => { placeOrder(modal.officeId, modal.itemId, modal.itemName, v.person?.trim()||"", v.note?.trim()||"", modal.orderType||"normal", v.quantity?.trim()||""); close(); }} onClose={close} />;
  if (modal.type === "irregular") return <IrregularModal offices={state.offices} onSubmit={(officeId, itemName, person, note) => { placeOrder(officeId, null, itemName, person, note, "extra", ""); close(); }} onClose={close} />;
  return null;
}

function TextInputModal({ title, fields, onSubmit, onClose, submitLabel = "保存" }) {
  const initVals = {}; fields.forEach(f => { initVals[f.key] = f.initial || ""; });
  const [vals, setVals] = useState(initVals);
  return (
    <Overlay><BottomSheet>
      <p style={S.modalTitle}>{title}</p>
      {fields.map((f, i) => (
        <div key={f.key} style={{ marginBottom: 10 }}>
          <label style={S.label}>{f.label}</label>
          <input style={S.input} value={vals[f.key]} placeholder={f.placeholder} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} autoFocus={i === 0} />
        </div>
      ))}
      <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>キャンセル</button><button style={S.submitBtn} onClick={() => onSubmit(vals)}>{submitLabel}</button></div>
    </BottomSheet></Overlay>
  );
}

function IrregularModal({ offices, onSubmit, onClose }) {
  const [officeId, setOfficeId] = useState(offices[0]?.id || "");
  const [itemName, setItemName] = useState(""); const [person, setPerson] = useState(""); const [note, setNote] = useState("");
  return (
    <Overlay><BottomSheet>
      <p style={S.modalTitle}>⭐️ 発注希望を追加</p>
      <label style={S.label}>事業所</label>
      <select style={S.select} value={officeId} onChange={e => setOfficeId(e.target.value)}>{offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <label style={S.label}>物品名</label><input style={S.input} value={itemName} onChange={e => setItemName(e.target.value)} placeholder="物品名を入力" autoFocus /><div style={{ height: 10 }} />
      <label style={S.label}>希望者名</label><input style={S.input} value={person} onChange={e => setPerson(e.target.value)} placeholder="希望者名" /><div style={{ height: 10 }} />
      <label style={S.label}>備考（任意）</label><input style={S.input} value={note} onChange={e => setNote(e.target.value)} placeholder="" />
      <div style={S.modalBtns}><button style={S.cancelBtn} onClick={onClose}>キャンセル</button><button style={S.submitBtn} onClick={() => { if (itemName.trim()) onSubmit(officeId, itemName.trim(), person.trim(), note.trim()); }}>希望を提出</button></div>
    </BottomSheet></Overlay>
  );
}

function OfficeTab({ state, selectedOffice, setSelectedOffice, office, officeItems, summaryLow, summaryNG, onAddOffice, onRenameOffice, onDeleteOffice, onAddItem, onRenameItem, onDeleteItem, onSetStatus, onSetThreshold }) {
  const [showSummary, setShowSummary] = useState(false);
  const total = Object.keys(summaryLow).length + Object.keys(summaryNG).length;
  return (
    <div>
      {total > 0 && <button style={S.summaryBanner} onClick={() => setShowSummary(v => !v)}>⚠️ {total}件の対応が必要な物品があります {showSummary ? "▲" : "▼"}</button>}
      {showSummary && <div style={S.card}><SummarySection title="× 要発注" items={summaryNG} /><SummarySection title="△ 残り少" items={summaryLow} /></div>}
      <div style={S.officeTabRow}>
        {state.offices.map(o => <button key={o.id} style={{ ...S.officeTabBtn, ...(o.id === selectedOffice ? S.officeTabBtnActive : {}) }} onClick={() => setSelectedOffice(o.id)}>{o.name}</button>)}
        <button style={S.officeAddBtn} onClick={onAddOffice}>＋</button>
      </div>
      {office && (
        <div style={S.card}>
          <div style={S.officeHeader}>
            <div><span style={S.officeName}>{office.name}</span><span style={S.officeDate}>最終更新：{officeItems.reduce((a, i) => i.updatedAt > a ? i.updatedAt : a, "") || "—"}</span></div>
            <div style={S.officeActions}><button style={S.iconBtn} onClick={() => onRenameOffice(office.id)}>✏️</button><button style={S.iconBtn} onClick={() => onDeleteOffice(office.id)}>🗑️</button></div>
          </div>
          {officeItems.length === 0 ? <p style={S.empty}>物品がありません。下のボタンから追加してください。</p>
            : <div style={S.itemList}>{officeItems.map(item => <ItemRow key={item.id} item={item} officeId={office.id} onSetStatus={onSetStatus} onSetThreshold={onSetThreshold} onRenameItem={onRenameItem} onDeleteItem={onDeleteItem} />)}</div>}
          <button style={S.addItemBtn} onClick={() => onAddItem(office.id)}>＋ 物品を追加</button>
        </div>
      )}
    </div>
  );
}

function SummarySection({ title, items }) {
  const entries = Object.entries(items); if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={S.summaryTitle}>{title}</p>
      {entries.map(([name, offs]) => (
        <div key={name} style={S.summaryItem}>
          <span style={S.summaryItemName}>{name}</span>
          <div style={S.summaryBadges}>{offs.map(o => <span key={o.officeId} style={{ ...S.chip, background: STATUS_COLOR[o.status]+"22", color: STATUS_COLOR[o.status], border: `1px solid ${STATUS_COLOR[o.status]}55` }}>{o.officeName}</span>)}</div>
        </div>
      ))}
    </div>
  );
}

function ItemRow({ item, officeId, onSetStatus, onSetThreshold, onRenameItem, onDeleteItem }) {
  const [open, setOpen] = useState(false);
  const isOrdered = item.status === "発注中";
  return (
    <div style={{ ...S.itemRow, borderLeft: `3px solid ${STATUS_COLOR[item.status] || "#ddd"}` }}>
      <div style={S.itemMain}>
        <div style={S.itemNameArea}>
          <span style={S.itemName}>{item.name}</span>
          <div style={{ display: "flex", gap: 4, marginTop: 3, alignItems: "center" }}>
            {item.threshold && <span style={S.thresholdBadge}>△:{item.threshold}</span>}
            <span style={S.itemDate}>{item.updatedAt}</span>
          </div>
        </div>
        <div style={S.statusArea}>
          {isOrdered ? <span style={{ ...S.statusChip, background: STATUS_COLOR["発注中"]+"22", color: STATUS_COLOR["発注中"], border: `1.5px solid ${STATUS_COLOR["発注中"]}` }}>発注中</span>
            : ["○","△","×"].map(s => <button key={s} style={{ ...S.statusBtn, background: item.status===s ? STATUS_COLOR[s] : "transparent", color: item.status===s ? "#fff" : STATUS_COLOR[s], border: `1.5px solid ${STATUS_COLOR[s]}` }} onClick={() => onSetStatus(officeId, item.id, s)}>{s}</button>)}
          <button style={S.moreBtn} onClick={() => setOpen(v => !v)}>⋯</button>
        </div>
      </div>
      {open && (
        <div style={S.itemActions}>
          <button style={S.actionBtn} onClick={() => { onRenameItem(officeId, item.id); setOpen(false); }}>✏️ 名前変更</button>
          <button style={S.actionBtn} onClick={() => { onSetThreshold(officeId, item.id); setOpen(false); }}>📏 △基準</button>
          <button style={{ ...S.actionBtn, color: "#ef4444" }} onClick={() => { onDeleteItem(officeId, item.id); setOpen(false); }}>🗑️ 削除</button>
        </div>
      )}
    </div>
  );
}

function OrderTab({ state, summaryLow, summaryNG, offices, markArrived, approveExtra, deleteHistory, onAddIrregular, onPlaceOrder, getQuantity, setQuantity }) {
  const [showHistory, setShowHistory] = useState(false);
  const normalOrders = state.orders.filter(o => o.type === "normal");
  const extraOrders = state.orders.filter(o => o.type === "extra");
  const arrived = state.orderHistory.filter(o => o.status === "arrived");
  return (
    <div>
      <div style={S.card}>
        <h2 style={{ ...S.sectionTitle, color: "#ef4444" }}>× 要発注リスト</h2>
        {Object.keys(summaryNG).length === 0 ? <p style={S.empty}>要発注の物品はありません</p>
          : Object.entries(summaryNG).map(([name, officesArr]) => <OrderableItemRow key={name} name={name} officesArr={officesArr} statusColor="#ef4444" accentLight="#ef444411" accentBorder="#ef444466" onPlaceOrder={onPlaceOrder} getQuantity={getQuantity} setQuantity={setQuantity} />)}
      </div>
      <div style={S.card}>
        <h2 style={{ ...S.sectionTitle, color: "#f59e0b" }}>△ 残り少リスト</h2>
        {Object.keys(summaryLow).length === 0 ? <p style={S.empty}>残り少の物品はありません</p>
          : Object.entries(summaryLow).map(([name, officesArr]) => <OrderableItemRow key={name} name={name} officesArr={officesArr} statusColor="#f59e0b" accentLight="#f59e0b11" accentBorder="#f59e0b66" onPlaceOrder={onPlaceOrder} getQuantity={getQuantity} setQuantity={setQuantity} />)}
      </div>
      <div style={S.card}>
        <h2 style={S.sectionTitle}>🛒 発注リスト</h2>
        {normalOrders.length === 0 ? <p style={S.empty}>発注中の物品はありません</p> : normalOrders.map(o => <OrderRow key={o.id} order={o} offices={offices} markArrived={markArrived} />)}
      </div>
      <div style={S.card}>
        <div style={S.rowBetween}><h2 style={S.sectionTitle}>⭐️ 通常リスト以外の発注希望</h2><button style={S.smallAddBtn} onClick={onAddIrregular}>＋ 追加</button></div>
        {extraOrders.length === 0 ? <p style={S.empty}>発注希望はありません</p> : extraOrders.map(o => <ExtraOrderRow key={o.id} order={o} offices={offices} markArrived={markArrived} onApprove={approveExtra} />)}
      </div>
      <div style={S.card}>
        <button style={S.historyToggle} onClick={() => setShowHistory(v => !v)}>📦 発注履歴（{arrived.length}件） {showHistory ? "▲" : "▼"}</button>
        {showHistory && (arrived.length === 0 ? <p style={S.empty}>履歴はありません</p> : arrived.map(o => <HistoryRow key={o.id} order={o} offices={offices} onDelete={deleteHistory} />))}
      </div>
    </div>
  );
}

function OrderableItemRow({ name, officesArr, statusColor, accentLight, accentBorder, onPlaceOrder, getQuantity, setQuantity }) {
  const [expanded, setExpanded] = useState(false);
  const canOrder = officesArr.some(o => o.status !== "発注中");
  return (
    <div style={{ borderBottom: "1px solid #f0f0f0", padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        <span style={S.summaryItemName}>{name}</span>
        {officesArr.map(o => <span key={o.officeId} style={{ ...S.chip, background: STATUS_COLOR[o.status]+"22", color: STATUS_COLOR[o.status], border: `1px solid ${STATUS_COLOR[o.status]}55` }}>{o.officeName}：{o.status}</span>)}
        <button style={{ ...S.expandBtn, borderColor: statusColor, color: statusColor }} onClick={() => setExpanded(v => !v)}>{expanded ? "▲ 閉じる" : "✏️ 数量入力"}</button>
      </div>
      {expanded && (
        <div style={S.quantityBlock}>
          {officesArr.map(o => {
            const qty = getQuantity(o.officeId, o.itemId); const isOrdered = o.status === "発注中";
            return (
              <div key={o.officeId} style={S.quantityRow}>
                <span style={S.quantityLabel}>{o.officeName}</span>
                <input style={{ ...S.quantityInput, opacity: isOrdered ? 0.5 : 1 }} value={qty} placeholder={isOrdered ? "発注中" : "例：3箱"} disabled={isOrdered} onChange={e => setQuantity(o.officeId, o.itemId, e.target.value)} />
                {!isOrdered ? <button style={{ ...S.orderBtn, background: accentLight, color: statusColor, border: `1px solid ${accentBorder}`, padding: "5px 10px" }} onClick={() => onPlaceOrder(o.officeId, o.itemId, name, qty)}>🛒 発注</button>
                  : <span style={{ ...S.chip, background: "#6366f122", color: "#6366f1", border: "1px solid #6366f155" }}>発注中</span>}
              </div>
            );
          })}
        </div>
      )}
      {!expanded && canOrder && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={{ ...S.orderBtn, background: accentLight, color: statusColor, border: `1px solid ${accentBorder}` }}
            onClick={() => { const t = officesArr.find(o => o.status !== "発注中"); if (t) onPlaceOrder(t.officeId, t.itemId, name, getQuantity(t.officeId, t.itemId)); }}>🛒 発注</button>
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, offices, markArrived }) {
  const office = offices.find(o => o.id === order.officeId);
  return (
    <div style={S.orderRow}>
      <div style={S.orderInfo}>
        <span style={S.orderItem}>{order.itemName}</span>
        {order.quantity && <span style={S.orderQty}>📦 数量：{order.quantity}</span>}
        <span style={S.orderMeta}>{office?.name}　担当：{order.person||"未設定"}　{order.orderedAt}</span>
        {order.note && <span style={S.orderNote}>📝 {order.note}</span>}
      </div>
      <div style={S.orderBtns}>
        <span style={{ ...S.chip, background: "#6366f122", color: "#6366f1", border: "1px solid #6366f155", whiteSpace: "nowrap" }}>発注中</span>
        <button style={S.arrivedBtn} onClick={() => markArrived(order.id)}>✅ 届いた</button>
      </div>
    </div>
  );
}

function ExtraOrderRow({ order, offices, markArrived, onApprove }) {
  const office = offices.find(o => o.id === order.officeId);
  const isPending = order.status === "pending";
  const [approving, setApproving] = useState(false);
  const [person, setPerson] = useState(order.person || ""); const [note, setNote] = useState(order.note || "");
  return (
    <div style={{ ...S.orderRow, flexDirection: "column", alignItems: "stretch", background: isPending ? "#fffbf0" : "transparent", borderRadius: 8, padding: "10px 8px", marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={S.orderInfo}>
          <span style={S.orderItem}>{order.itemName}</span>
          <span style={S.orderMeta}>{office?.name}　希望者：{order.person||"未設定"}　{order.orderedAt}</span>
          {order.note && <span style={S.orderNote}>📝 {order.note}</span>}
        </div>
        <div style={S.orderBtns}>
          {order.status === "ordered" ? (
            <><span style={{ ...S.chip, background: "#6366f122", color: "#6366f1", border: "1px solid #6366f155", whiteSpace: "nowrap" }}>発注中</span><button style={S.arrivedBtn} onClick={() => markArrived(order.id)}>✅ 届いた</button></>
          ) : (
            <><span style={{ ...S.chip, background: "#f59e0b22", color: "#92510a", border: "1px solid #f59e0b55", whiteSpace: "nowrap" }}>希望中</span><button style={{ ...S.orderBtn, padding: "5px 10px" }} onClick={() => setApproving(v => !v)}>{approving ? "▲ 閉じる" : "🛒 発注する"}</button></>
          )}
        </div>
      </div>
      {approving && isPending && (
        <div style={S.approveForm}>
          <label style={S.label}>発注担当者名</label><input style={{ ...S.input, marginBottom: 8 }} value={person} onChange={e => setPerson(e.target.value)} placeholder="担当者名" />
          <label style={S.label}>備考（任意）</label><input style={{ ...S.input, marginBottom: 8 }} value={note} onChange={e => setNote(e.target.value)} placeholder="" />
          <button style={S.submitBtn} onClick={() => { onApprove(order.id, person, note); setApproving(false); }}>発注確定</button>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ order, offices, onDelete }) {
  const office = offices.find(o => o.id === order.officeId);
  return (
    <div style={S.orderRow}>
      <div style={S.orderInfo}>
        <span style={{ ...S.orderItem, opacity: 0.6 }}>{order.itemName}</span>
        {order.quantity && <span style={{ ...S.orderQty, opacity: 0.6 }}>📦 {order.quantity}</span>}
        <span style={{ ...S.orderMeta, opacity: 0.6 }}>{office?.name}　担当：{order.person||"—"}　発注:{order.orderedAt} → 着荷:{order.arrivedAt}</span>
        {order.note && <span style={{ ...S.orderNote, opacity: 0.6 }}>📝 {order.note}</span>}
      </div>
      <div style={S.orderBtns}>
        <span style={{ ...S.chip, background: "#4caf7d22", color: "#4caf7d", border: "1px solid #4caf7d55" }}>着荷済</span>
        <button style={S.deleteHistoryBtn} onClick={() => onDelete(order.id)}>🗑️</button>
      </div>
    </div>
  );
}

function Overlay({ children }) { return <div style={S.overlay}>{children}</div>; }
function BottomSheet({ children }) { return <div style={S.modalBox}>{children}</div>; }

const S = {
  root: { fontFamily: "'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif", background: "#f4f6fb", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 40 },
  header: { background: "#1e2233", color: "#fff", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px #0003" },
  headerInner: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" },
  logo: { fontSize: 17, fontWeight: 700 },
  tabBar: { display: "flex", gap: 4 },
  tabBtn: { background: "transparent", color: "#99a", border: "none", padding: "8px 18px", borderRadius: "8px 8px 0 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabActive: { background: "#f4f6fb", color: "#1e2233" },
  badge: { display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 700, minWidth: 17, height: 17, padding: "0 3px", marginLeft: 4, verticalAlign: "middle" },
  main: { padding: "12px 10px 0" },
  summaryBanner: { width: "100%", background: "#fff3cd", border: "1.5px solid #f59e0b", color: "#92510a", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, textAlign: "left", cursor: "pointer", marginBottom: 8 },
  card: { background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 8px #0001" },
  summaryTitle: { fontSize: 13, fontWeight: 800, color: "#555", margin: "0 0 8px" },
  summaryItem: { borderBottom: "1px solid #f0f0f0", padding: "7px 0", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  summaryItemName: { fontSize: 14, fontWeight: 600, color: "#222", minWidth: 90, flex: 1 },
  summaryBadges: { display: "flex", flexWrap: "wrap", gap: 4 },
  chip: { borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px", display: "inline-block" },
  officeTabRow: { display: "flex", overflowX: "auto", gap: 6, paddingBottom: 8, marginBottom: 6, scrollbarWidth: "none" },
  officeTabBtn: { flexShrink: 0, background: "#e8eaf2", color: "#555", border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  officeTabBtnActive: { background: "#1e2233", color: "#fff" },
  officeAddBtn: { flexShrink: 0, background: "transparent", border: "1.5px dashed #aab", color: "#778", borderRadius: 20, padding: "5px 14px", fontSize: 14, cursor: "pointer" },
  officeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  officeName: { fontSize: 17, fontWeight: 800, color: "#1e2233", display: "block" },
  officeDate: { fontSize: 11, color: "#999", display: "block", marginTop: 2 },
  officeActions: { display: "flex", gap: 6 },
  iconBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 4 },
  empty: { color: "#bbb", fontSize: 13, textAlign: "center", padding: "12px 0", margin: 0 },
  itemList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  itemRow: { background: "#f8f9fc", borderRadius: 10, padding: "10px 12px", borderLeft: "3px solid #ddd" },
  itemMain: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  itemNameArea: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: 600, color: "#222", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  thresholdBadge: { display: "inline-block", background: "#fff3cd", color: "#92510a", borderRadius: 99, fontSize: 9, fontWeight: 700, padding: "1px 6px", border: "1px solid #f59e0b55" },
  itemDate: { fontSize: 10, color: "#bbb" },
  statusArea: { display: "flex", gap: 4, alignItems: "center", flexShrink: 0 },
  statusBtn: { borderRadius: 8, fontSize: 14, fontWeight: 700, width: 34, height: 34, cursor: "pointer", transition: "all 0.15s", padding: 0 },
  statusChip: { borderRadius: 8, fontSize: 12, fontWeight: 700, padding: "5px 10px" },
  moreBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#bbb", padding: "0 2px", lineHeight: 1 },
  itemActions: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee" },
  actionBtn: { background: "#f0f2f8", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#444" },
  addItemBtn: { marginTop: 2, background: "#1e2233", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: "#1e2233", marginTop: 0, marginBottom: 10 },
  expandBtn: { background: "transparent", border: "1px solid", borderRadius: 8, fontSize: 11, fontWeight: 700, padding: "3px 8px", cursor: "pointer" },
  quantityBlock: { background: "#f8f9fc", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8, marginTop: 4, marginBottom: 4 },
  quantityRow: { display: "flex", alignItems: "center", gap: 8 },
  quantityLabel: { fontSize: 12, fontWeight: 600, color: "#555", minWidth: 80, flexShrink: 0 },
  quantityInput: { flex: 1, border: "1.5px solid #dde", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", minWidth: 0 },
  orderRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #f0f0f0", padding: "10px 0", gap: 8 },
  orderInfo: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 },
  orderItem: { fontSize: 14, fontWeight: 700, color: "#222" },
  orderQty: { fontSize: 12, fontWeight: 600, color: "#6366f1" },
  orderMeta: { fontSize: 11, color: "#888" },
  orderNote: { fontSize: 11, color: "#6366f1" },
  orderBtns: { display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 },
  orderBtn: { background: "#ef444411", color: "#ef4444", border: "1px solid #ef444466", borderRadius: 8, fontSize: 12, fontWeight: 700, padding: "3px 10px", cursor: "pointer" },
  arrivedBtn: { background: "#4caf7d", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  smallAddBtn: { background: "#1e2233", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  historyToggle: { background: "none", border: "none", fontSize: 14, fontWeight: 700, color: "#888", cursor: "pointer", padding: 0, marginBottom: 8 },
  deleteHistoryBtn: { background: "#fee2e2", border: "none", borderRadius: 8, padding: "4px 8px", fontSize: 14, cursor: "pointer" },
  approveForm: { background: "#f8f9fc", borderRadius: 10, padding: "10px 12px", marginTop: 8, display: "flex", flexDirection: "column", gap: 4 },
  overlay: { position: "fixed", inset: 0, background: "#0007", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  modalBox: { background: "#fff", borderRadius: "18px 18px 0 0", padding: "22px 20px 36px", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column" },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#1e2233", margin: "0 0 14px" },
  label: { fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 4, display: "block" },
  select: { border: "1.5px solid #dde", borderRadius: 8, padding: "9px 10px", fontSize: 14, background: "#fafbff", width: "100%", marginBottom: 12, boxSizing: "border-box" },
  input: { border: "1.5px solid #dde", borderRadius: 8, padding: "9px 10px", fontSize: 14, background: "#fafbff", width: "100%", boxSizing: "border-box" },
  modalBtns: { display: "flex", gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, background: "#eee", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  submitBtn: { flex: 2, background: "#1e2233", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
