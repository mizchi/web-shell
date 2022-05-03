import { useEffect } from "react";
import { useRef } from "react";
import { init_term } from "../term";
import { Context } from "../types";

export default function Terminal(props: { ctx: Context }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current == null) return;
    (async () => {
      await init_term(props.ctx, ref.current as HTMLElement);
    })();
  }, [props.ctx, ref.current]);
  return <div style={{ width: '100%', height: '98vh' }} ref={ref}></div>
}

