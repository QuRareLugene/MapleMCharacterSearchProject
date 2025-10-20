/* =========================================================================
 * Maple M Viewer — Rendering Logic
 * ========================================================================= */

function parseEffectValue(value) {
  const num = parseFloat(String(value).replace(/,/g, ''));
  const unit = String(value).replace(/[\d.,\s]/g, '');
  return { num: isNaN(num) ? 0 : num, unit };
}

function parseSkillNameAndLevel(name) {
  if (!name) return { name: '-', level: null };
  const match = name.match(/Lv\.(\d+)\s+(.+)/);
  if (match) {
    return { name: match[2], level: parseInt(match[1], 10) };
  }
  return { name: name, level: null };
}

function renderOptionLines(stack, values) {
  const lines = new Array(3).fill("-");
  values.forEach((val, i) => {
    if (i < 3 && val) lines[i] = val;
  });
  lines.forEach(line => stack.append(elt("div", "option-line", line)));
}

/* ---------- 메인 렌더 ---------- */
function renderAll(data, worldLabel) {
  const S = {
    basic:{data:data.basic}, stat:{data:data.stat},
    item_equipment:{data:data.item_equipment}, set_effect:{data:data.set_effect},
    symbol:{data:data.symbol}, android_equipment:{data:data.android_equipment},
    jewel:{data:data.jewel}, pet_equipment:{data:data.pet_equipment},
    skill_equipment:{data:data.skill_equipment}, link_skill:{data:data.link_skill},
    vmatrix:{data:data.vmatrix}
  };

  /* 기본 정보 */
  const b = S.basic?.data || {};
  $("#basic").classList.remove("hidden");
  const avatar = $("#char-img");
  const repl = safeImg(b.character_image, "character", 120, "avatar") || Object.assign(document.createElement("div"), { className:"avatar" });
  avatar.replaceWith(repl); repl.id = "char-img";
  $("#name").textContent = b.character_name || "-";
  $("#job").textContent = b.character_job_name || b.character_class || "-";
  $("#world-label").textContent = worldLabel || b.world_name || "-";
  $("#level").textContent = b.character_level ?? "-";
  const times = [];
  if (b.character_date_create) times.push("생성: " + b.character_date_create);
  if (b.character_date_last_login) times.push("최근 접속: " + b.character_date_last_login);
  if (b.character_date_last_logout) times.push("최근 로그아웃: " + b.character_date_last_logout);
  $("#times").textContent = times.join(" · ");

  /* 스탯 */
  const statArr = S.stat?.data?.stat || S.stat?.data?.final_stat || [];
  const smap = new Map(statArr.map(s => [s.stat_name, s.stat_value]));
  const sg = $("#stats-grid"); sg.innerHTML = ""; sg.className = "stats-grid profile";
  const statsToFormat = new Set(["전투력", "HP", "MP", "물리 공격력", "마법 공격력", "물리 방어력", "마법 방어력"]);
  const mk = (name, val, cls="") => {
    const box = elt("div", `stat ${cls}`);
    box.append(elt("div", "k", name));
    const vtxt = statsToFormat.has(name) ? toManNotation(val) : val ?? "-";
    box.append(elt("div", "v", vtxt));
    return box;
  };
  sg.append(mk("전투력", smap.get("전투력"), "full"));
  sg.append(mk("HP", smap.get("HP")));
  sg.append(mk("MP", smap.get("MP")));
  sg.append(mk("물리 공격력", smap.get("물리 공격력")));
  sg.append(mk("마법 공격력", smap.get("마법 공격력")));
  sg.append(mk("물리 방어력", smap.get("물리 방어력")));
  sg.append(mk("마법 방어력", smap.get("마법 방어력")));

  /* 심볼 */
  const sy = S.symbol?.data || {};
  const listSy = $("#symbol-list"); listSy.innerHTML = "";
  const arcanes = sy.arcane_symbol || [];
  const auths = sy.authentic_symbol || [];
  const symbolsSec = $("#symbols");
  if (arcanes.length || auths.length) {
    symbolsSec.classList.remove("hidden");
    listSy.className = "symbol-groups";
    const stripPrefix = (name) => String(name || "").replace(/^\s*(아케인\s*심볼|아케인심볼|어센틱\s*심볼|어센틱심볼)\s*:\s*/i, "").trim();
    const mkGroup = (title, arr, kind) => {
      const wrap = document.createElement("li");
      const t = elt("div", "symbol-group-title", title);
      const grid = elt("div", "symbol-grid");
      if (!arr.length) grid.append(emptyCard("없음"));
      arr.forEach(sym => {
        const card = elt("div", "symbol-card has-topchip");
        card.append(chip(kind, "mini top-left"));
        const icon = safeImg(sym.symbol_icon, sym.symbol_name, 56);
        if (icon) card.append(icon); else card.append(elt("div"));
        const meta = document.createElement("div");
        const region = stripPrefix(sym.symbol_name || "-");
        meta.append(elt("div", "symbol-name", `${kind} : ${region}`));
        if (sym.symbol_level != null) {
          meta.append(elt("div", "symbol-level", `Lv. ${sym.symbol_level}`));
        }
        const chips = [];
        effectTextToChips(sym.symbol_option).forEach((c) => chips.push(c));
        chipStack(meta, chips, "stacked");
        card.append(meta);
        grid.append(card);
      });
      wrap.append(t, grid);
      return wrap;
    };
    listSy.append(
      mkGroup("아케인 심볼", arcanes, "아케인심볼"),
      mkGroup("어센틱 심볼", auths, "어센틱심볼")
    );
  } else symbolsSec.classList.add("hidden");

  /* 장비 */
  const eqList = S.item_equipment?.data?.item_equipment || [];
  const equipWrap = $("#equip-wrap"); equipWrap.innerHTML = "";
  const slotMap = {};
  for (const it of eqList) {
    const key = normalizeSlot(it.item_equipment_slot_name || it.item_equipment_page_name);
    if (key && !slotMap[key]) slotMap[key] = it;
  }
  const hadOnePiece = !!slotMap["한벌옷"];
  if (hadOnePiece) { slotMap["상의"] = slotMap["한벌옷"]; slotMap.__onePiece = true; delete slotMap["한벌옷"]; }

  function buildEquipCard(slotLabel, item, noteWhenEmpty="장비 없음") {
    const gradeName = item?.item_grade || "";
    const borderCls = GRADE_BORDER_CLASS[gradeName] || "grade-border-normal";
    const card = elt("div", "equip" + (item ? ` ${borderCls}` : " empty"));
    card.classList.add("has-topchip");
    if (slotLabel) card.append(chip(slotLabel, "mini top-left"));

    if (item && item.item_icon) {
      const img = safeImg(item.item_icon, item.item_name, 56);
      if (img) card.append(img); else card.append(elt("div"));
    } else { card.append(elt("div")); }

    const body = document.createElement("div");
    if (item) {
      body.append(elt("div","name", item.item_name || "-"));

      const gradeChip = item.item_grade ? chip(item.item_grade, GRADE_CHIP_CLASS[item.item_grade] || "") : null;
      if (gradeChip) body.append(chipRow(gradeChip));
      if (item.starforce_upgrade) body.append(chipRow(chip(`${item.starforce_upgrade}★`)));
      if (item.equipment_level != null) body.append(chipRow(chip(`Lv. ${item.equipment_level}`)));
      const trans = normalizeAbilityFlag(item.transmission_able, "전승 가능", "전승 불가");
      const todd  = normalizeAbilityFlag(item.todd_able, "전수 가능", "전수 불가");
      if (trans || todd) body.append(chipRow(trans ? chip(trans) : null, todd ? chip(todd) : null));

      body.append(elt("hr", "divider"));

      const mainOpts = effectTextToChips(item.item_option);
      if (mainOpts.length) {
        body.append(chipSection("장비의 주옵션", (stack)=>{ mainOpts.forEach(o=>stack.append(elt("div", "option-line", o))); }));
      }

      if (!isAccessorySlot(slotLabel)) {
        const potVals = (item.item_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null);
        body.append(chipSection("잠재능력", (stack) => renderOptionLines(stack, potVals)));

        const addVals = (item.item_additional_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null);
        body.append(chipSection("애디셔널", (stack) => renderOptionLines(stack, addVals)));
      }

      if (item.soul_equipment_flag === "1" && item.soul_info) {
        const soul = document.createElement("div");
        soul.className = "soul";
        soul.append(elt("div","soul-title", item.soul_info.soul_name || "소울"));
        const eff = (item.soul_info.soul_option || "").trim();
        if (eff) soul.append(elt("div","soul-opt", eff));
        body.append(soul);
      }
    } else {
      body.append(elt("div","slot-label", slotLabel));
      body.append(elt("div","note", noteWhenEmpty));
    }
    card.append(body);
    return card;
  }
  function groupBlock(title){ const wrap=elt("div","equip-group"); wrap.append(h4(title)); return wrap; }

  $("#equip").classList.remove("hidden");
  { const wrap=groupBlock("무기"); const grid=elt("div","equip-grid");
    ["무기","보조무기","엠블렘"].forEach(s=>grid.append(buildEquipCard(s, slotMap[s])));
    wrap.append(grid); equipWrap.append(wrap); }
  { const wrap=groupBlock("주 방어구"); const grid=elt("div","equip-grid");
    grid.append(buildEquipCard("모자", slotMap["모자"]));
    grid.append(buildEquipCard("상의", slotMap["상의"]));
    if (slotMap.__onePiece) grid.append(buildEquipCard("하의 (한벌옷)", null, "(한벌옷)"));
    else grid.append(buildEquipCard("하의", slotMap["하의"]));
    wrap.append(grid); equipWrap.append(wrap); }
  { const wrap=groupBlock("보조 방어구"); const g3=elt("div","row-grid-3 equal");
    g3.append(buildEquipCard("장갑",slotMap["장갑"]));
    g3.append(buildEquipCard("신발",slotMap["신발"]));
    g3.append(buildEquipCard("",null,"없음"));
    g3.append(buildEquipCard("어깨",slotMap["어깨"]));
    g3.append(buildEquipCard("망토",slotMap["망토"]));
    g3.append(buildEquipCard("벨트",slotMap["벨트"]));
    wrap.append(g3); equipWrap.append(wrap); }
  { const wrap=groupBlock("주 장신구");
    const r1=elt("div","row-grid-2 equal"); ["반지 1","반지 2"].forEach(s=>r1.append(buildEquipCard(s,slotMap[s])));
    const r2=elt("div","row-grid-2 equal"); ["반지 3","반지 4"].forEach(s=>r2.append(buildEquipCard(s,slotMap[s])));
    const r3=elt("div","row-grid-2 equal"); ["목걸이 1","목걸이 2"].forEach(s=>r3.append(buildEquipCard(s,slotMap[s])));
    const r4=elt("div","row-grid-2 equal"); r4.append(buildEquipCard("귀걸이 1", slotMap["귀걸이 1"])); r4.append(buildEquipCard("",null,"없음"));
    const r5=elt("div","row-grid-2 equal"); ["얼굴장식","눈장식"].forEach(s=>r5.append(buildEquipCard(s,slotMap[s])));
    wrap.append(r1,r2,r3,elt("div","block-gap"),r4,elt("div","block-gap"),r5); equipWrap.append(wrap); }
  { const wrap=groupBlock("보조 장신구");
    const r1=elt("div","row-grid-2 equal"); ["훈장","칭호"].forEach(s=>r1.append(buildEquipCard(s,slotMap[s])));
    const r2=elt("div","row-grid-2 equal"); ["뱃지","포켓"].forEach(s=>r2.append(buildEquipCard(s,slotMap[s])));
    wrap.append(r1,r2); equipWrap.append(wrap); }

  /* 세트 효과 (2단 카드) */
  const sets = S.set_effect?.data?.set_info || [];
  const setEl = $("#set-list"); setEl.innerHTML = "";
  if (sets.length) {
    $("#sets").classList.remove("hidden");
    for (const s of sets) {
      const li = document.createElement("li");
      const card = elt("div","set-card");
      card.append(elt("div","set-title", `${s.set_name} (${s.set_count}셋)`));
      const stack = elt("div","chip-stack stacked");
      setEffectToChips(String(s.set_option||"")).forEach(l=>stack.append(chipRow(chip(l))));
      card.append(stack); li.append(card); setEl.append(li);
    }
  }

  /* 쥬얼 */
  const jw = S.jewel?.data || {};
  const jewelSec = $("#jewel"); const gridJ = $("#jewel-grid"); gridJ.innerHTML = "";
  if (jw?.jewel_equipment?.length) {
    jewelSec.classList.remove("hidden");
    const active = Number(jw.use_jewel_page_no);
    jw.jewel_equipment.sort((a,b)=>(a.jewel_page_no??0)-(b.jewel_page_no??0)).forEach(pg=>{
      const pageNo = pg.jewel_page_no ?? "-";
      const page = elt("div", `jewel-page has-topchip ${pageNo===active?"active":"inactive"}`);
      page.append(chip(`쥬얼 페이지 ${pageNo}`, "mini top-left"));
      const head = elt("div","header");
      head.append(elt("div","muted small", pageNo===active ? "사용 중" : "비활성"));
      page.append(head);

      const pageOpt = pg.jewel_page_option || pg.jewel_page_effect || "";
      const pageChips = effectTextToChips(pageOpt);
      if (pageChips.length) chipStack(page, pageChips, "stacked");

      const five = elt("div","jewel-five");
      const gems = pg.jewel_info || [];
      if (!gems.length) five.append(emptyCard("젬 없음"));
      gems.forEach(j=>{
        const card = elt("div","jewel-card " + (j.jewel_grade?`grade-${String(j.jewel_grade).toUpperCase()}`:""));
        const icon = safeImg(j.jewel_icon, j.jewel_name, 48, "jewel-icon");
        const meta = document.createElement("div"); meta.className="jewel-meta";
        meta.append(elt("span","name", j.jewel_name || "-"));
        const opt = j.jewel_option || "";
        if (opt) {
          const st = elt("div","chip-stack stacked");
          effectTextToChips(opt).forEach(o=>st.append(chipRow(chip(o))));
          meta.append(st);
        }
        if (icon) card.append(icon);
        card.append(meta);
        five.append(card);
      });
      page.append(five);
      gridJ.append(page);
    });
  } else { jewelSec.classList.remove("hidden"); gridJ.append(emptyCard("쥬얼 정보 없음")); }

  /* 안드로이드/하트/캐시장비 — 통합 카드 */
  const adAll = S.android_equipment?.data || {};
  const ad = adAll.android_equipment || {};
  const heart = adAll.heart_equipment || {};
  const pet = S.pet_equipment?.data || {};

  const androidSec = $("#android"); androidSec.classList.remove("hidden");
  const adWrap = $("#android-wrap"); adWrap.innerHTML = "";
  const heartWrap = $("#heart-wrap"); heartWrap.innerHTML = "";
  const petWrap = $("#pet-wrap"); petWrap.innerHTML = "";

  const androidCard = elt("div","subcard android-card has-topchip");
  androidCard.append(chip("안드로이드", "mini top-left"));

  // 본체
  const headBox = elt("div","android-head");
  if (Object.keys(ad).length) {
    const adIcon = safeImg(ad.android_icon, ad.android_name, 56, "icon-56");
    if (adIcon) headBox.append(adIcon);
    const meta = elt("div","android-meta");
    meta.append(elt("div","title-lg", `${ad.android_name || "-"} (${ad.android_grade || "-"})`));
    const tags = [];
    if (ad.android_non_humanoid_flag==="1") tags.push("비인간형");
    tags.push(`창고${ad.android_warehouse_usable_flag==="1"?" 사용가능":" 사용불가"}`);
    if (tags.length) meta.append(elt("div","kvline", tags.join(" · ")));
    headBox.append(meta);
  } else headBox.append(elt("div","muted","안드로이드 없음"));
  androidCard.append(headBox);

  // 캐시장비
  const cashList = ad.android_cash_item_equipment || [];
  const cashBox = elt("div","android-section");
  cashBox.append(elt("div","chip-title","캐시 장비"));
  if (cashList.length) {
    const grid = elt("div","mini-grid");
    cashList.forEach(ci=>{
      const c = elt("div","mini-card with-icon has-topchip");
      c.append(chip("캐시","mini top-left"));
      const icon = safeImg(ci.cash_item_icon, ci.cash_item_name, 28);
      if (icon) c.append(icon);
      const meta = elt("div","mini-meta");
      meta.append(elt("div","skill-name", ci.cash_item_name || "-"));
      const sub = [];
      if (ci.cash_item_equipment_page_name) sub.push(ci.cash_item_equipment_page_name);
      if (ci.cash_item_equipment_slot_name) sub.push(ci.cash_item_equipment_slot_name);
      if (sub.length) meta.append(elt("div","mini-sub", sub.join(" · ")));
      c.append(meta);
      grid.append(c);
    });
    cashBox.append(grid);
  } else { cashBox.append(emptyCard("캐시 장비 없음")); }
  androidCard.append(cashBox);

  // 하트 (등급/★/레벨/옵션/잠재/에디)
  const heartBox = elt("div","android-section");
  heartBox.append(elt("div","chip-title","하트"));
  if (Object.keys(heart).length) {
    const row = elt("div","heart-row");
    const hIcon = safeImg(heart.heart_icon, heart.heart_name, 40, "icon-40");
    if (hIcon) row.append(hIcon);
    const hm = elt("div","heart-meta");
    hm.append(elt("div","title-lg", heart.heart_name || "-"));
    const topChips = [];
    if (heart.item_grade) topChips.push(chip(heart.item_grade, GRADE_CHIP_CLASS[heart.item_grade]||""));
    if (heart.starforce_upgrade) topChips.push(chip(`${heart.starforce_upgrade}★`));
    if (heart.equipment_level != null) topChips.push(chip(`Lv. ${heart.equipment_level}`));
    if (topChips.length) hm.append(chipRow(...topChips));

    const main = effectTextToChips(heart.item_option || heart.heart_option);
    if (main.length) hm.append(chipSection("옵션", (st)=> main.forEach(o=>st.append(chipRow(chip(o))))));

    const potVals = (heart.item_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null).filter(Boolean);
    const addVals = (heart.item_additional_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null).filter(Boolean);
    if (potVals.length) hm.append(chipSection("잠재능력", (st)=> potVals.forEach(v=>st.append(chipRow(chip(v))))));
    if (addVals.length) hm.append(chipSection("애디셔널", (st)=> addVals.forEach(v=>st.append(chipRow(chip(v))))));

    row.append(hm);
    heartBox.append(row);
  } else heartBox.append(emptyCard("하트 없음"));
  androidCard.append(heartBox);

  adWrap.append(androidCard);

  // 펫
  const petCard = elt("div","subcard");
  petCard.append(h4("펫"));
  const pRows = elt("div","row-grid-3 equal");
  const pets = [
    { name: pet.pet_1_name, type: pet.pet_1_pet_type, expire: pet.pet_1_date_expire },
    { name: pet.pet_2_name, type: pet.pet_2_pet_type, expire: pet.pet_2_date_expire },
    { name: pet.pet_3_name, type: pet.pet_3_pet_type, expire: pet.pet_3_date_expire }
  ];

  pets.forEach((p, i) => {
    const c = elt("div","mini-card has-topchip pet-card");
    c.append(chip(`펫 ${i+1}`, "mini top-left"));
    c.append(elt("div", "pet-name", p.name || "없음"));
    if (p.name) {
      c.append(petTypeChip(p.type));
      if (p.expire) {
        const date = new Date(p.expire).toLocaleDateString();
        c.append(elt("div", "pet-expire", `만료: ${date}`));
      }
    }
    pRows.append(c);
  });
  petCard.append(pRows);
  petWrap.append(petCard);

  /* 스킬 장착 (기존) */
  const eqSkills = S.skill_equipment?.data?.skill?.equipment_skill || [];
  const skillPresets = S.skill_equipment?.data?.skill?.preset || [];
  const skList = $("#skill-list"); skList.innerHTML = "";
  const presetDiv = $("#skill-presets"); presetDiv.textContent = "";
  if (eqSkills.length) {
    $("#skills").classList.remove("hidden");
    const bySet = new Map();
    eqSkills.forEach(s => {
      const k = s.equipment_skill_set ?? 0;
      if (!bySet.has(k)) bySet.set(k, []);
      bySet.get(k).push(s);
    });
    presetDiv.textContent = `사용 세트: ${[...bySet.keys()].sort((a,b)=>a-b).join(", ")}`;
    [...bySet.entries()].sort((a,b)=>a[0]-b[0]).forEach(([setNo, items])=>{
      const card = elt("div","skill-set");
      card.append(h4(`세트 ${setNo}`));
      const grid = elt("div", "skill-grid");
      items.forEach(s=>{
        const { name, level } = parseSkillNameAndLevel(s.skill_name);
        const mc = elt("div", "skill-card");
        mc.append(elt("div", "skill-name", name));
        if (level != null) {
          mc.append(elt("div", "skill-level", `Lv. ${level}`));
        }
        grid.append(mc);
      });
      card.append(grid);
      skList.append(card);
    });

    const allSkillCards = skList.querySelectorAll('.skill-card');
    if (allSkillCards.length > 0) {
      let maxHeight = 0;
      allSkillCards.forEach(c => {
        if (c.offsetHeight > maxHeight) {
          maxHeight = c.offsetHeight;
        }
      });

      if (maxHeight > 0) {
        allSkillCards.forEach(c => {
          c.style.height = `${maxHeight}px`;
        });
      }
    }
  } else { $("#skills").classList.remove("hidden"); skList.append(emptyCard("스킬 장착 없음")); }

  /* 스킬 프리셋 */
  const presetsSection = $("#skill_presets_section");
  const presetsList = $("#skill_presets_list");
  presetsList.innerHTML = "";

  if (skillPresets.length) {
    presetsSection.classList.remove("hidden");

    skillPresets.sort((a, b) => a.preset_slot_no - b.preset_slot_no).forEach(p => {
      const presetContainer = elt("div", "skill-preset-group");
      presetContainer.append(h4(`${p.preset_slot_no}번 스킬 프리셋`));

      const grid = elt("div", "skill-preset-grid");
      const skills = [
        p.skill_name_1,
        p.skill_name_2,
        p.skill_name_3,
        p.skill_name_4
      ];

      skills.forEach(skillName => {
        if (skillName) {
          const { name, level } = parseSkillNameAndLevel(skillName);
          const mc = elt("div", "skill-card");
          mc.append(elt("div", "skill-name", name));
          if (level != null) {
            mc.append(elt("div", "skill-level", `Lv. ${level}`));
          }
          grid.append(mc);
        } else {
          const emptySlot = elt("div", "skill-card empty-slot", "비어있음");
          grid.append(emptySlot);
        }
      });
      presetContainer.append(grid);
      presetsList.append(presetContainer);
    });
  } else {
    presetsSection.classList.add("hidden");
  }

  /* 링크 스킬 — 스킬명 → 레벨 → 효과 */
  const linkPresets = S.link_skill?.data?.link_skill || [];
  const usePreset = S.link_skill?.data?.use_prest_no;
  const linkUseEl = $("#link-use"); linkUseEl.textContent = "";
  const linkList = $("#link-list"); linkList.innerHTML = "";
  if (linkPresets.length) {
    $("#links").classList.remove("hidden");
    linkUseEl.textContent = usePreset != null ? `활성 프리셋: ${usePreset}` : "";
    linkPresets.sort((a,b)=>a.preset_no-b.preset_no).forEach(p=>{
      const pc = elt("div",`preset-card ${p.preset_no===usePreset?"active":"inactive"}`);
      pc.append(h4(`프리셋 ${p.preset_no}`));
      const grid = elt("div","grid-2");
      const arr = p.link_skill_info || [];
      if (!arr.length) grid.append(emptyCard("링크 없음"));

      const groupedSkills = new Map();
      arr.forEach(ls => {
        if (!groupedSkills.has(ls.skill_name)) {
          groupedSkills.set(ls.skill_name, {
            ...ls,
            skill_level: 0,
            effects: new Map(),
            count: 0
          });
        }
        const entry = groupedSkills.get(ls.skill_name);
        entry.skill_level += ls.skill_level;
        entry.count++;

        if (ls.skill_effect) {
            const effects = ls.skill_effect.split(',').map(e => e.trim());
            effects.forEach(eff => {
                const parts = eff.split(':').map(part => part.trim());
                if (parts.length === 2) {
                    const name = parts[0];
                    const { num, unit } = parseEffectValue(parts[1]);
                    if (entry.effects.has(name)) {
                        entry.effects.get(name).num += num;
                    } else {
                        entry.effects.set(name, { num, unit });
                    }
                }
            });
        }
      });
      
      const aggregatedSkills = Array.from(groupedSkills.values());
      aggregatedSkills.forEach(ls => {
          let combinedEffect = "";
          if (ls.effects.size > 0) {
              const effectParts = [];
              ls.effects.forEach((value, name) => {
                  effectParts.push(`${name} : ${value.num.toLocaleString()}${value.unit}`);
              });
              combinedEffect = effectParts.join(', ');
          }
          ls.skill_effect = combinedEffect;
          
        const cell = elt("div","mini-card link-card");
        const ic = safeImg(ls.skill_icon, ls.skill_name, 28);
        if (ic) { cell.classList.add("with-icon"); cell.prepend(ic); }
        const meta = elt("div","link-meta");
        meta.append(elt("div","skill-name", ls.skill_name || "-"));
        if (ls.skill_level != null) {
          meta.append(elt("div", "skill-level", `Lv. ${ls.skill_level}`));
        }
        if (ls.skill_effect) {
          const chips = effectTextToChips(ls.skill_effect);
          const st = elt("div","chip-stack stacked");
          chips.forEach(c=>st.append(chipRow(chip(c))));
          meta.append(st);
        }
        cell.append(meta);
        grid.append(cell);
      });
      pc.append(grid);
      linkList.append(pc);
    });
  } else { $("#links").classList.remove("hidden"); linkList.append(emptyCard("링크 스킬 없음")); }

  /* V 매트릭스 — 2×15, 상단 정렬 + 타입/레벨 결합 칩 */
  const vcores = S.vmatrix?.data?.character_v_core_equipment || [];
  const vList = $("#v-list"); vList.innerHTML = "";
  if (vcores.length) {
    $("#vmatrix").classList.remove("hidden");

    const coreGroups = { enhancement: [], skill: [], special: [] };
    const typeMap = { enhancement: "강화 코어", skill: "스킬 코어", special: "특수 코어" };
    vcores.forEach(v => {
      const type = (v.v_core_type || "").toLowerCase();
      if (coreGroups[type]) coreGroups[type].push(v);
    });

    Object.entries(typeMap).forEach(([type, title]) => {
      const cores = coreGroups[type];
      if (cores.length === 0) return;
      
      const groupEl = elt("div", "v-group");
      groupEl.append(h4(title));
      const grid = elt("div", "v-grid");
      
      cores.forEach(v => {
        const type = (v.v_core_type || "").toLowerCase();
        const card = elt("div", "v-card has-topchip");
        if (type) card.classList.add(`vtype-${type}`);
        card.style.alignSelf = "start";

        const typeShort = type === "skill" ? "스킬 코어" : type === "enhancement" ? "강화 코어" : "특수 코어";
        card.append(chip(typeShort, "mini top-left"));

        const nameEl = elt("div", "v-name", v.v_core_name || "-");
        card.append(nameEl);
        
        if (v.v_core_level != null) {
          const levelEl = elt("div", "v-level", `Lv. ${v.v_core_level}`);
          card.append(levelEl);
        }

        if (type === "enhancement") {
          const names = [v.v_core_skill_name_1, v.v_core_skill_name_2, v.v_core_skill_name_3].filter(s => s && s !== "(Unknown)");
          if (names.length) {
            const sec = chipSection("강화 대상", (stack) => names.forEach(nm => stack.append(chipRow(chip(nm)))));
            card.append(sec);
          }
        }
        const desc = [];
        if (v.v_core_skill_effect) effectTextToChips(v.v_core_skill_effect).forEach(c => desc.push(c));
        if (desc.length) chipStack(card, desc, "stacked");

        grid.append(card);
      });
      groupEl.append(grid);
      vList.append(groupEl);
    });
  } else { $("#vmatrix").classList.remove("hidden"); vList.append(emptyCard("V 매트릭스 없음")); }
}
