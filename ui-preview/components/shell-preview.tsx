"use client";

import {
  ChevronDown, ChevronRight, LogOut, MapPin,
  MessageSquareText, Sparkles, Sprout, Table2,
} from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import coMaLogo from "../../src/static/assets/stitch-simulation/co-ma-logo.png";
import portrait from "../../src/static/assets/stitch-profile-portrait.jpg";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";

type SectionId = "community" | "forum" | "simulation" | "assistant" | "profile";

const sections = {
  community: { title: "Kho CSV cộng đồng", short: "Kho CSV", icon: Table2 },
  forum: { title: "Thảo luận bà con", short: "Diễn đàn", icon: MessageSquareText },
  simulation: { title: "Mô phỏng sinh lý lúa", short: "Mô phỏng", icon: Sprout },
  assistant: { title: "Trợ lý Cò Mạ", short: "Trợ lý Cò Mạ", icon: Sparkles },
  profile: { title: "Hồ sơ nông hộ", short: "Hồ sơ", icon: Sprout },
};

const primarySections: SectionId[] = ["community", "forum", "simulation"];
const secondarySections: SectionId[] = ["assistant"];
const sidebarSections = [...primarySections, ...secondarySections];

interface NavButtonProps {
  id: SectionId;
  active: boolean;
  sidebar?: boolean;
  short?: boolean;
  onSelect: (id: SectionId) => void;
}

function NavButton({ id, active, sidebar, short, onSelect }: NavButtonProps) {
  const { icon: Icon, title, short: shortTitle } = sections[id];
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(id)}
      className={`relative flex min-h-11 items-center gap-2 rounded-lg text-[13px] font-semibold whitespace-nowrap text-muted transition-colors hover:bg-selected aria-[current=page]:bg-selected aria-[current=page]:text-leaf motion-reduce:transition-none ${sidebar ? "w-full px-3 text-left" : "px-2 sm:px-2.5"}`}
    >
      {sidebar && active ? (
        <motion.span
          aria-hidden="true" layoutId="sidebar-current"
          className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-leaf"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      ) : null}
      <Icon className={short ? "hidden sm:block" : "shrink-0"} size={16} aria-hidden="true" />
      {short ? shortTitle : title}
    </button>
  );
}

export function ShellPreview() {
  const [current, setCurrent] = useState<SectionId>("community");
  const [moreOpen, setMoreOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(true);

  function select(id: SectionId) {
    setCurrent(id);
    setMoreOpen(false);
  }

  return (
    <MotionConfig reducedMotion="user">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:p-2 focus:text-white">Đến nội dung chính</a>
      <header className="sticky top-0 z-30 grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-b border-divider bg-header px-3 py-1.5 shadow-xs lg:grid-cols-[calc(var(--container-sidebar)_-_2.125rem)_minmax(0,1fr)_auto] lg:gap-x-4 lg:px-4.5 lg:py-0">
        <button type="button" onClick={() => select("community")} className="col-start-1 row-start-1 flex min-h-11 items-center gap-2.5 justify-self-start rounded-lg text-base leading-tight font-extrabold tracking-tight whitespace-nowrap max-[360px]:gap-1.5 max-[360px]:text-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-divider bg-selected max-[360px]:size-8">
            <Image src={coMaLogo} alt="" width={30} height={30} priority className="rounded-md" />
          </span>
          <span translate="no">Mạch Đồng</span>
        </button>
        <nav aria-label="Điều hướng nhanh" className="col-span-2 col-start-1 row-start-2 flex gap-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:min-h-16 lg:items-center lg:border-l lg:border-divider lg:pl-4">
          {primarySections.map((id) => <NavButton key={id} id={id} active={current === id} short onSelect={select} />)}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-muted hover:bg-selected data-[state=open]:bg-selected lg:hidden">
              Thêm <ChevronDown size={14} aria-hidden="true" />
            </SheetTrigger>
            <SheetContent open={moreOpen} title="Điều hướng Mạch Đồng">
              <nav aria-label="Các trang khác" className="grid gap-1">
                {secondarySections.map((id) => <NavButton key={id} id={id} active={current === id} sidebar onSelect={select} />)}
              </nav>
            </SheetContent>
          </Sheet>
        </nav>
        <div className="col-start-2 row-start-1 flex items-center gap-1 justify-self-end lg:col-start-3 lg:gap-2">
          {signedIn ? (
            <>
              <span className="flex items-center gap-1 rounded-lg border border-divider bg-selected px-2 py-2 text-xs font-bold whitespace-nowrap text-leaf tabular-nums max-[360px]:px-1.5 max-[360px]:text-[11px]">
                <Sprout size={14} className="max-[360px]:hidden" aria-hidden="true" /> 350 LÚA
              </span>
              <button type="button" aria-label="Chỉnh sửa hồ sơ và mật khẩu" aria-current={current === "profile" ? "page" : undefined} onClick={() => select("profile")} className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-selected aria-[current=page]:bg-selected sm:px-2">
                <Image src={portrait} alt="" width={32} height={32} priority className="size-8 rounded-lg object-cover" />
                <span className="hidden text-left text-xs sm:block"><strong>Chú Năm Ruộng</strong><small className="block text-muted">Nông hộ · @chunam</small></span>
                <ChevronRight size={13} className="hidden sm:block" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Đăng xuất" onClick={() => { setSignedIn(false); select("community"); }} className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-muted hover:bg-selected sm:px-2">
                <LogOut size={16} aria-hidden="true" /> <span className="hidden sm:block">Đăng xuất</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setSignedIn(true)} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-selected">Đăng nhập</button>
              <button type="button" onClick={() => setSignedIn(true)} className="min-h-11 rounded-lg bg-leaf px-3 text-xs font-semibold text-white hover:bg-ink">Đăng ký</button>
            </>
          )}
        </div>
      </header>
      <div className="lg:grid lg:grid-cols-[var(--container-sidebar)_minmax(0,1fr)]">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] flex-col gap-3 overflow-y-auto border-r border-divider bg-rail px-3 pt-5 pb-3 lg:flex">
          <p className="px-3 text-[11px] font-semibold text-muted">Đồng bằng sông Cửu Long</p>
          <nav aria-label="Không gian làm việc" className="grid gap-1">
            {sidebarSections.map((id) => <NavButton key={id} id={id} active={current === id} sidebar onSelect={select} />)}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 rounded-xl border border-divider bg-white p-2.5 text-xs">
            <span className="grid size-8 place-items-center rounded-lg bg-selected text-leaf"><MapPin size={16} aria-hidden="true" /></span>
            <span><strong>Long Hữu</strong><small className="block text-muted">Địa bàn demo</small></span>
          </div>
        </aside>
        <main id="content" tabIndex={-1} className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-6xl scroll-mt-28 px-4 py-6 sm:px-8 sm:py-8">
          <span className="inline-flex rounded-md border border-divider bg-white px-2 py-1 text-xs font-semibold text-muted">[Giả lập]</span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{sections[current].title}</h1>
        </main>
      </div>
    </MotionConfig>
  );
}
