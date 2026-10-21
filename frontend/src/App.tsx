import { Calculator } from './components/Calculator'
import { ThemePicker } from './theme/ThemePicker'

export default function App() {
  return (
    <>
      <Calculator />
      <ThemePicker />
      <a
        className="source-link"
        href="https://github.com/zgrgrcn/calculator-fullstack"
        target="_blank"
        rel="noopener noreferrer"
      >
        source
      </a>
    </>
  )
}
