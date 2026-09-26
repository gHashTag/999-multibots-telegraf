import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  RUNS_PER_HOUR,
  checkSources,
  commandsFor,
  resetHdlBudgetForTests,
  runHdl,
  type Exec,
} from './src/agent/hdl-run'

/**
 * THE ENGINEERS' HANDS (owner, 2026-09-26). The source is untrusted: each
 * case is a way a testbench could reach past its directory, a script could
 * be smuggled in, or a run could claim what the tools did not print.
 */
const ctx = { telegramId: '900000041' } as never
beforeEach(() => resetHdlBudgetForTests())

const FIFO = `module fifo #(parameter W=8, D=16) (
  input clk, input rst, input wr, input rd, input [W-1:0] din,
  output reg [W-1:0] dout, output full, output empty);
  reg [W-1:0] mem [0:D-1];
  reg [4:0] wp, rp;
  assign full = (wp - rp) == D;
  assign empty = wp == rp;
  always @(posedge clk) begin
    if (rst) begin wp <= 0; rp <= 0; dout <= 0; end
    else begin
      if (wr && !full) begin mem[wp[3:0]] <= din; wp <= wp + 1; end
      if (rd && !empty) begin dout <= mem[rp[3:0]]; rp <= rp + 1; end
    end
  end
endmodule
`
const TB = `module tb;
  reg clk=0, rst=1, wr=0, rd=0; reg [7:0] din=0; wire [7:0] dout; wire full, empty;
  fifo u(.clk(clk),.rst(rst),.wr(wr),.rd(rd),.din(din),.dout(dout),.full(full),.empty(empty));
  always #1 clk = ~clk;
  initial begin
    #4 rst=0;
    repeat (16) begin @(negedge clk) wr=1; din=din+1; end
    @(negedge clk) wr=0;
    if (!full) begin $display("FAIL not full"); $finish; end
    @(negedge clk) rd=1; @(negedge clk) rd=0; @(negedge clk);
    if (dout !== 8'd1) $display("FAIL dout=%0d", dout); else $display("PASS fifo");
    $finish;
  end
endmodule
`

describe('what may not be run', () => {
  it.each([
    ['$fopen("/proc/1/environ","r")', '$fopen'],
    ['$readmemh("/etc/passwd", m)', '$readmemh'],
    ['$dumpfile("/tmp/x.vcd")', '$dumpfile'],
    ['$system("id")', '$system'],
    ['if ($value$plusargs("K=%s", k))', '$value$plusargs'],
  ])(
    'a testbench with %s is refused before any disk is touched',
    (code, task) => {
      const r = checkSources([
        { name: 'tb.v', content: `module tb; initial ${code}; endmodule` },
      ])
      expect(r.ok).toBe(false)
      expect(!r.ok && r.reason).toContain(task)
    }
  )

  it('`include only of a file handed in with the run', () => {
    expect(
      checkSources([
        { name: 'a.v', content: '`include "/etc/passwd"\nmodule a; endmodule' },
      ]).ok
    ).toBe(false)
    expect(
      checkSources([
        { name: 'a.v', content: '`include <defs.vh>\nmodule a; endmodule' },
      ]).ok
    ).toBe(false)
    expect(
      checkSources([
        { name: 'a.v', content: '`include "defs.vh"\nmodule a; endmodule' },
        { name: 'defs.vh', content: '`define W 8' },
      ]).ok
    ).toBe(true)
  })

  it('names are plain file names; $finish and $display are allowed', () => {
    expect(checkSources([{ name: '../x.v', content: '' }]).ok).toBe(false)
    expect(checkSources([{ name: 'x.txt', content: '' }]).ok).toBe(false)
    expect(checkSources([{ name: 'tb.v', content: TB }]).ok).toBe(true)
  })

  it('the yosys script is ours; a top that is not an identifier is refused', () => {
    const files = [{ name: 'fifo.v', content: FIFO }]
    expect(commandsFor('synth', files, 'fifo; shell rm -rf /')).toHaveProperty(
      'reason'
    )
    expect(commandsFor('synth', files, null)).toHaveProperty('reason')
    const steps = commandsFor('synth', files, 'fifo') as Array<{
      args: string[]
    }>
    expect(steps[0].args.join(' ')).toContain(
      'synth_xilinx -top fifo; tee -q -o stat.txt stat'
    )
  })
})

describe('running', () => {
  it('the child gets no environment beyond PATH and HOME, and the output is the tools’ own', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = []
    const exec: Exec = async (cmd, args) => {
      calls.push({ cmd, args })
      return {
        code: 0,
        stdout: `${cmd} ok`,
        stderr: '',
        timedOut: false,
        missing: false,
      }
    }
    const r = await runHdl(
      {
        mode: 'sim',
        files: [
          { name: 'fifo.v', content: FIFO },
          { name: 'tb.v', content: TB },
        ],
        top: 'tb',
      },
      ctx,
      { exec }
    )
    expect(calls.map(c => c.cmd)).toEqual(['iverilog', 'vvp'])
    expect(r).toMatchObject({ ran: true, passed: true })
    const src = (await import('node:fs')).readFileSync(
      `${__dirname}/src/agent/hdl-run.ts`,
      'utf8'
    )
    expect(src).toMatch(
      /env: \{ PATH: process\.env\.PATH \?\? '[^']*', HOME: opts\.cwd \}/
    )
  })

  it('a missing tool is said as missing, never guessed', async () => {
    const exec: Exec = async () => ({
      code: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      missing: true,
    })
    const r = await runHdl(
      { mode: 'lint', files: [{ name: 'fifo.v', content: FIFO }] },
      ctx,
      { exec }
    )
    expect(r).toMatchObject({ ran: false })
    expect(String(r.reason)).toContain('не запускалось')
  })

  it(`at most ${RUNS_PER_HOUR} runs an hour per person`, async () => {
    const exec: Exec = async () => ({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      missing: false,
    })
    const args = { mode: 'lint', files: [{ name: 'fifo.v', content: FIFO }] }
    for (let i = 0; i < RUNS_PER_HOUR; i += 1)
      expect((await runHdl(args, ctx, { exec, now: () => 0 })).ran).toBe(true)
    expect((await runHdl(args, ctx, { exec, now: () => 0 })).ran).toBe(false)
  })
})

const has = (t: string) => {
  try {
    execFileSync('which', [t])
    return true
  } catch {
    return false
  }
}

describe.skipIf(!has('iverilog') || !has('verilator') || !has('yosys'))(
  'the real tools',
  () => {
    const files = [
      { name: 'fifo.v', content: FIFO },
      { name: 'tb.v', content: TB },
    ]
    it('simulates the FIFO testbench: PASS printed by vvp itself', async () => {
      const r = (await runHdl({ mode: 'sim', files, top: 'tb' }, ctx)) as {
        passed: boolean
        steps: Array<{ output: string }>
      }
      expect(r.passed).toBe(true)
      expect(r.steps[1].output).toContain('PASS fifo')
    })

    it('lints and synthesises it; a broken module fails with the tool’s own error', async () => {
      const lint = await runHdl(
        { mode: 'lint', files: [files[0]], top: 'fifo' },
        ctx
      )
      expect(lint).toMatchObject({ ran: true })
      const synth = (await runHdl(
        { mode: 'synth', files: [files[0]], top: 'fifo' },
        ctx
      )) as {
        passed: boolean
        steps: Array<{ output: string }>
      }
      expect(synth.passed).toBe(true)
      expect(synth.steps[0].output).toMatch(/Number of cells/i)
      const broken = (await runHdl(
        {
          mode: 'sim',
          files: [{ name: 'b.v', content: 'module b; wire x = ; endmodule' }],
        },
        ctx
      )) as { passed: boolean; steps: Array<{ exit: number }> }
      expect(broken.passed).toBe(false)
      expect(broken.steps[0].exit).not.toBe(0)
    }, 90_000)
  }
)
