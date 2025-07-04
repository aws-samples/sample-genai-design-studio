import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Settings from '../Settings'

describe('Settings', () => {
  it('renders the settings title', () => {
    render(<Settings />)
    
    expect(screen.getByText('設定')).toBeInTheDocument()
  })

  it('renders all setting options', () => {
    render(<Settings />)
    
    expect(screen.getByText('ダークモード')).toBeInTheDocument()
    expect(screen.getByText('アプリケーションの外観をダークテーマに変更します')).toBeInTheDocument()
    
    expect(screen.getByText('通知')).toBeInTheDocument()
    expect(screen.getByText('画像生成完了時に通知を受け取ります')).toBeInTheDocument()
    
    expect(screen.getByText('自動保存')).toBeInTheDocument()
    expect(screen.getByText('生成した画像を自動的に保存します')).toBeInTheDocument()
  })

  it('renders auto-save message', () => {
    render(<Settings />)
    
    expect(screen.getByText('設定は自動的に保存されます。')).toBeInTheDocument()
  })

  it('toggles dark mode setting', () => {
    render(<Settings />)
    
    const darkModeSwitch = screen.getAllByRole('checkbox')[0]
    expect(darkModeSwitch).not.toBeChecked()
    
    fireEvent.click(darkModeSwitch)
    expect(darkModeSwitch).toBeChecked()
    
    fireEvent.click(darkModeSwitch)
    expect(darkModeSwitch).not.toBeChecked()
  })

  it('toggles notifications setting', () => {
    render(<Settings />)
    
    const notificationsSwitch = screen.getAllByRole('checkbox')[1]
    expect(notificationsSwitch).toBeChecked() // Default is true
    
    fireEvent.click(notificationsSwitch)
    expect(notificationsSwitch).not.toBeChecked()
    
    fireEvent.click(notificationsSwitch)
    expect(notificationsSwitch).toBeChecked()
  })

  it('toggles auto-save setting', () => {
    render(<Settings />)
    
    const autoSaveSwitch = screen.getAllByRole('checkbox')[2]
    expect(autoSaveSwitch).toBeChecked() // Default is true
    
    fireEvent.click(autoSaveSwitch)
    expect(autoSaveSwitch).not.toBeChecked()
    
    fireEvent.click(autoSaveSwitch)
    expect(autoSaveSwitch).toBeChecked()
  })

  it('maintains independent state for each setting', () => {
    render(<Settings />)
    
    const [darkModeSwitch, notificationsSwitch, autoSaveSwitch] = screen.getAllByRole('checkbox')
    
    // Initial states
    expect(darkModeSwitch).not.toBeChecked()
    expect(notificationsSwitch).toBeChecked()
    expect(autoSaveSwitch).toBeChecked()
    
    // Toggle dark mode
    fireEvent.click(darkModeSwitch)
    expect(darkModeSwitch).toBeChecked()
    expect(notificationsSwitch).toBeChecked()
    expect(autoSaveSwitch).toBeChecked()
    
    // Toggle notifications
    fireEvent.click(notificationsSwitch)
    expect(darkModeSwitch).toBeChecked()
    expect(notificationsSwitch).not.toBeChecked()
    expect(autoSaveSwitch).toBeChecked()
    
    // Toggle auto-save
    fireEvent.click(autoSaveSwitch)
    expect(darkModeSwitch).toBeChecked()
    expect(notificationsSwitch).not.toBeChecked()
    expect(autoSaveSwitch).not.toBeChecked()
  })

  it('renders settings in a Paper component', () => {
    const { container } = render(<Settings />)
    
    const paper = container.querySelector('.MuiPaper-root')
    expect(paper).toBeInTheDocument()
    
    const list = paper?.querySelector('.MuiList-root')
    expect(list).toBeInTheDocument()
  })

  it('renders dividers between settings', () => {
    const { container } = render(<Settings />)
    
    const dividers = container.querySelectorAll('.MuiDivider-root')
    expect(dividers).toHaveLength(2) // Two dividers for three settings
  })

  it('uses ListItemSecondaryAction for switches', () => {
    const { container } = render(<Settings />)
    
    const secondaryActions = container.querySelectorAll('.MuiListItemSecondaryAction-root')
    expect(secondaryActions).toHaveLength(3)
    
    secondaryActions.forEach(action => {
      const switchElement = action.querySelector('.MuiSwitch-root')
      expect(switchElement).toBeInTheDocument()
    })
  })
})
