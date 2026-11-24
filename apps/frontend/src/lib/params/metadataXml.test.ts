// ArduPilot's XML definition file of a released version, as the download gives it. The file here is made up for the test, in the
// shape xmlemit.py writes (the real ones are GPL and are never part of the repository: the SITL end-to-end test reads them from
// ArduPilot's server for each vehicle type).
import { describe, expect, it } from 'vitest'
import { parseMetadata } from './metadata'
import { isPdefXml, parsePdefXml } from './metadataXml'

const XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- made up for the test -->
<paramfile>
  <vehicles>
    <parameters name="ArduCopter">
      <param humanName="Return height" name="ArduCopter:RTL_ALT" documentation="Up, &quot;above home&quot;." user="Standard">
        <field name="Units">cm</field>
        <field name="UnitText">centimeters</field>
        <field name="Range">30 300000</field>
        <field name="Increment">1</field>
      </param>
      <param humanName="Frame" name="ArduCopter:FRAME_CLASS" documentation="The frame." user="Advanced">
        <field name="RebootRequired">True</field>
        <values>
          <value code="0">Undefined</value>
          <value code="1">Quad</value>
        </values>
      </param>
      <param humanName="Checks" name="ArduCopter:CHECKS" documentation="What is checked.">
        <bitmask>
          <bit code="0">All</bit>
          <bit code="1">Barometer</bit>
        </bitmask>
        <field name="Bitmask">0:All,1:Barometer</field>
      </param>
      <param humanName="Counter" name="ArduCopter:STAT_RUNTIME" documentation="Time running." user="Standard">
        <field name="ReadOnly">True</field>
        <field name="Volatile">True</field>
        <field name="Range">low high</field>
      </param>
    </parameters>
  </vehicles>
  <libraries>
    <parameters name="SERVO">
      <param humanName="Rate" name="SERVO_RATE" documentation="Output rate." user="Advanced">
        <field name="Range">25 400</field>
        <field name="Units">Hz</field>
      </param>
      <param humanName="Not this one" name="RTL_ALT" documentation="A second group with the same name." />
    </parameters>
  </libraries>
</paramfile>
`

// eslint-disable-next-line max-lines-per-function -- the cases of one file, kept together
describe('ArduPilot\'s XML definition file', () => {
  it('reads names, descriptions, units, ranges, steps, values, bits and flags, without the vehicle in front of the name', () => {
    const m = parsePdefXml(XML)

    expect(m.get('RTL_ALT')).toEqual({
      description: 'Return height',
      longDescription: 'Up, "above home".',
      units: 'cm',
      min: 30,
      max: 300000,
      increment: 1,
      user: 'standard',
    })
    expect(m.get('FRAME_CLASS')).toEqual({
      description: 'Frame',
      longDescription: 'The frame.',
      values: { 0: 'Undefined', 1: 'Quad' },
      rebootRequired: true,
      user: 'advanced',
    })
    const bits = { 0: 'All', 1: 'Barometer' }
    expect(m.get('CHECKS')).toEqual({ description: 'Checks', longDescription: 'What is checked.', bits })
    expect(m.get('SERVO_RATE')).toMatchObject({ units: 'Hz', min: 25, max: 400 })
  })

  it('keeps the first group that names a parameter, and ignores a range that is not numbers', () => {
    const m = parsePdefXml(XML)

    expect(m.get('RTL_ALT')?.description).toBe('Return height')
    expect(m.get('STAT_RUNTIME')).toEqual({
      description: 'Counter',
      longDescription: 'Time running.',
      readOnly: true,
      volatile: true,
      user: 'standard',
    })
    expect(m.size).toBe(5)
  })

  it('is read by the loader of every metadata file, and an XML file that is not one is refused', () => {
    expect(isPdefXml(XML)).toBe(true)
    const m = parseMetadata(XML)
    expect(typeof m === 'string' ? m : m.size).toBe(5)

    expect(parseMetadata('<html><body>maintenance</body></html>')).toBe('an XML file that is not ArduPilot\'s apm.pdef.xml')
    expect(parseMetadata('<?xml version="1.0"?><paramfile></paramfile>')).toBe('it describes no parameters')
  })

  it('gives nothing for a file that is cut short', () => {
    expect(parsePdefXml(XML.slice(0, XML.indexOf('<libraries>'))).size).toBe(0)
  })
})
